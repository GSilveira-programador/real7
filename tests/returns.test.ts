import { it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../src/lib/payments", () => ({ mp: vi.fn() }));
import { mp } from "../src/lib/payments";
import { db } from "../src/lib/db";
import {
  requestReturn,
  decideReturn,
  reconcileReturnRefund,
} from "../src/lib/returns";
const actor = "return-test-" + randomUUID();
const recipient = actor + "@example.invalid";
let order: any, request: any;
beforeAll(async () => {
  const variant = await db.variant.findFirstOrThrow();
  order = await db.order.create({
    data: {
      accessHash: "test",
      idempotencyKey: randomUUID(),
      email: recipient,
      name: "Fixture devolução",
      phone: "11999999999",
      address: {},
      status: "DELIVERED",
      subtotal: 10000,
      discount: 0,
      shipping: 0,
      total: 10000,
      shippingService: "TEST",
      expiresAt: new Date(),
      items: {
        create: {
          variantId: variant.id,
          name: "TEST",
          size: variant.size,
          quantity: 1,
          price: 10000,
        },
      },
      payment: { create: { providerId: actor, status: "approved" } },
    },
  });
});
beforeEach(async () => {
  vi.resetAllMocks();
  await db.returnRequest.deleteMany({ where: { orderId: order.id } });
  await db.orderEvent.deleteMany({ where: { orderId: order.id } });
  await db.mail.deleteMany({ where: { recipient } });
  await db.auditLog.deleteMany({ where: { actorId: actor } });
  await db.order.update({
    where: { id: order.id },
    data: { status: "DELIVERED" },
  });
  await db.payment.update({
    where: { orderId: order.id },
    data: { status: "approved" },
  });
  request = await requestReturn(order.id, {
    reason: "Produto não serviu no tamanho escolhido.",
  });
});
afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: order.id } });
  await db.auditLog.deleteMany({ where: { actorId: actor } });
  await db.mail.deleteMany({ where: { recipient } });
  await db.orderEvent.deleteMany({ where: { orderId: order.id } });
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.orderItem.deleteMany({ where: { orderId: order.id } });
  await db.order.delete({ where: { id: order.id } });
  await db.$disconnect();
});
const note = "Orientação registrada pela equipe para o cliente.";
async function receive() {
  await decideReturn(
    request.id,
    { status: "approved", version: 0, note },
    actor,
  );
  await decideReturn(
    request.id,
    { status: "received", version: 1, note },
    actor,
  );
}
function refund() {
  return {
    id: "refund-test",
    payment_id: actor,
    amount: 100,
    status: "approved",
  };
}
it("serializa solicitações concorrentes sem duplicar pedido de devolução", async () => {
  await db.returnRequest.deleteMany({ where: { orderId: order.id } });
  const result = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      requestReturn(order.id, {
        reason: "Preciso devolver o produto recebido.",
      }),
    ),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.returnRequest.count({ where: { orderId: order.id } })).toBe(
    1,
  );
});
it("rejeita salto de etapa, versão obsoleta e observação vazia", async () => {
  await expect(
    decideReturn(request.id, { status: "refunded", version: 0, note }, actor),
  ).rejects.toThrow("transição");
  await decideReturn(
    request.id,
    { status: "approved", version: 0, note },
    actor,
  );
  await expect(
    decideReturn(request.id, { status: "received", version: 0, note }, actor),
  ).rejects.toThrow("alterada");
  await expect(
    decideReturn(
      request.id,
      { status: "received", version: 1, note: "" },
      actor,
    ),
  ).rejects.toThrow();
  expect(mp).not.toHaveBeenCalled();
});
it("permite nova análise após recusa, preservando decisão anterior", async () => {
  await decideReturn(
    request.id,
    { status: "rejected", version: 0, note },
    actor,
  );
  const next = await requestReturn(order.id, {
    reason: "Solicito nova análise com informações adicionais.",
  });
  expect(next.id).not.toBe(request.id);
  expect(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .decisionNote,
  ).toBe(note);
});
it("impede solicitações para pedido sem pagamento", async () => {
  await db.order.update({
    where: { id: order.id },
    data: { status: "PENDING" },
  });
  await expect(
    requestReturn(order.id, {
      reason: "Motivo de teste com tamanho suficiente.",
    }),
  ).rejects.toThrow("elegível");
});
it("reembolso confirmado persiste pedido, auditoria e aviso atomicamente sem repor estoque", async () => {
  await receive();
  const stocks = await db.variant.findMany({
    select: { id: true, stock: true },
    orderBy: { id: "asc" },
  });
  vi.mocked(mp).mockResolvedValue(refund());
  expect(
    await decideReturn(
      request.id,
      { status: "refunded", version: 2, note },
      actor,
    ),
  ).toEqual({ ok: true });
  expect(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .refundState,
  ).toBe("confirmed");
  expect(
    await db.mail.count({
      where: { recipient, subject: "Reembolso confirmado" },
    }),
  ).toBe(1);
  expect(
    await db.auditLog.count({
      where: { actorId: actor, action: "return.refund_confirmed" },
    }),
  ).toBe(1);
  expect(
    await db.variant.findMany({
      select: { id: true, stock: true },
      orderBy: { id: "asc" },
    }),
  ).toEqual(stocks);
});
it("dois operadores simultâneos enviam apenas um POST financeiro", async () => {
  await receive();
  vi.mocked(mp).mockResolvedValue(refund());
  const result = await Promise.allSettled(
    Array.from({ length: 2 }, () =>
      decideReturn(request.id, { status: "refunded", version: 2, note }, actor),
    ),
  );
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(mp).toHaveBeenCalledTimes(1);
});
it("timeout exige consulta e nunca repete automaticamente a solicitação financeira", async () => {
  await receive();
  vi.mocked(mp).mockRejectedValueOnce(new Error("timeout"));
  expect(
    await decideReturn(
      request.id,
      { status: "refunded", version: 2, note },
      actor,
    ),
  ).toMatchObject({ pending: true });
  const uncertain = await db.returnRequest.findUniqueOrThrow({
    where: { id: request.id },
  });
  expect(uncertain.refundState).toBe("uncertain");
  await expect(
    decideReturn(
      request.id,
      { status: "refunded", version: uncertain.version, note },
      actor,
    ),
  ).rejects.toThrow("já iniciado");
  vi.mocked(mp).mockResolvedValue([refund()]);
  await Promise.all([
    reconcileReturnRefund(request.id, actor),
    reconcileReturnRefund(request.id, actor),
  ]);
  expect(
    vi.mocked(mp).mock.calls.filter((call) => call[1] !== undefined),
  ).toHaveLength(1);
  expect(
    await db.mail.count({
      where: { recipient, subject: "Reembolso confirmado" },
    }),
  ).toBe(1);
  expect(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .status,
  ).toBe("refunded");
});
it("valor ou pagamento divergente não confirma reembolso", async () => {
  await receive();
  vi.mocked(mp).mockResolvedValue({ ...refund(), amount: 1 });
  expect(
    await decideReturn(
      request.id,
      { status: "refunded", version: 2, note },
      actor,
    ),
  ).toMatchObject({ pending: true });
  vi.mocked(mp).mockResolvedValue([{ ...refund(), payment_id: "outro" }]);
  expect(await reconcileReturnRefund(request.id, actor)).toMatchObject({
    pending: true,
  });
  expect(
    await db.mail.count({
      where: { recipient, subject: "Reembolso confirmado" },
    }),
  ).toBe(0);
});
it("consulta vazia mantém estado incerto sem enviar novo reembolso", async () => {
  await receive();
  vi.mocked(mp).mockResolvedValue({ status: "pending" });
  await decideReturn(
    request.id,
    { status: "refunded", version: 2, note },
    actor,
  );
  vi.mocked(mp).mockResolvedValue([]);
  expect(await reconcileReturnRefund(request.id, actor)).toMatchObject({
    pending: true,
  });
  expect(
    (await db.returnRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .refundState,
  ).toBe("uncertain");
});
