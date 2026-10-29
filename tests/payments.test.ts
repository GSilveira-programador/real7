import { it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../src/lib/external", () => ({ externalFetch: vi.fn() }));
import { externalFetch } from "../src/lib/external";
import { db } from "../src/lib/db";
import { syncPayment } from "../src/lib/payments";
const mocked = vi.mocked(externalFetch);
let order: any;
beforeAll(async () => {
  const v = await db.variant.findFirstOrThrow();
  order = await db.order.create({
    data: {
      accessHash: "test",
      idempotencyKey: randomUUID(),
      email: "payment-test@example.invalid",
      name: "Fixture de teste",
      phone: "11999999999",
      address: {},
      subtotal: 10000,
      discount: 0,
      shipping: 0,
      total: 10000,
      shippingService: "TEST",
      expiresAt: new Date(Date.now() + 86400000),
      items: {
        create: {
          variantId: v.id,
          name: "TEST",
          size: v.size,
          quantity: 1,
          price: 10000,
        },
      },
      payment: { create: {} },
    },
  });
});
afterAll(async () => {
  await db.auditLog.deleteMany({ where: { entityId: order.id } });
  await db.mail.deleteMany({ where: { recipient: order.email } });
  await db.paymentTransaction.deleteMany({
    where: { payment: { orderId: order.id } },
  });
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.orderEvent.deleteMany({ where: { orderId: order.id } });
  await db.orderItem.deleteMany({ where: { orderId: order.id } });
  await db.order.delete({ where: { id: order.id } });
  await db.$disconnect();
});
beforeEach(async () => {
  await db.paymentTransaction.deleteMany({
    where: { payment: { orderId: order.id } },
  });
  await db.orderEvent.deleteMany({ where: { orderId: order.id } });
  await db.mail.deleteMany({ where: { recipient: order.email } });
  await db.auditLog.deleteMany({ where: { entityId: order.id } });
  await db.order.update({
    where: { id: order.id },
    data: { status: "PENDING", stockReleased: false },
  });
  await db.payment.update({
    where: { orderId: order.id },
    data: { status: "pending", providerId: null, providerUpdatedAt: null },
  });
  delete process.env.MP_COLLECTOR_ID;
  process.env.MP_ACCESS_TOKEN = "TEST-ONLY-MOCKED";
});
function response(
  amount: number,
  status = "approved",
  date = "2026-10-29T00:00:00Z",
  id = "test-" + order.id,
) {
  mocked.mockResolvedValue({
    ok: true,
    json: async () => ({
      id,
      external_reference: order.id,
      currency_id: "BRL",
      transaction_amount: amount,
      status,
      date_last_updated: date,
      collector_id: 123,
    }),
  } as any);
}
it("não aceita valor divergente do pedido", async () => {
  response(1);
  await expect(syncPayment("123")).rejects.toThrow(/divergente/);
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("PENDING");
});
it("confirma no backend e ignora webhook duplicado sem duplicar transação ou e-mail", async () => {
  response(100);
  await syncPayment("123");
  await syncPayment("123");
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("PAID");
  expect(
    await db.paymentTransaction.count({
      where: { payment: { orderId: order.id } },
    }),
  ).toBe(1);
  expect(await db.mail.count({ where: { recipient: order.email } })).toBe(1);
});

it("serializa dez webhooks idênticos sem falhas nem avisos duplicados", async () => {
  response(100);
  await Promise.all(Array.from({ length: 10 }, () => syncPayment("123")));
  expect(
    await db.paymentTransaction.count({
      where: { payment: { orderId: order.id } },
    }),
  ).toBe(1);
  expect(await db.mail.count({ where: { recipient: order.email } })).toBe(1);
  expect(
    await db.orderEvent.count({ where: { orderId: order.id, status: "PAID" } }),
  ).toBe(1);
});
it("registra evento atrasado sem regredir pagamento ou pedido", async () => {
  response(100, "approved", "2026-10-29T12:00:00Z");
  await syncPayment("123");
  response(100, "pending", "2026-10-29T11:00:00Z");
  await syncPayment("123");
  expect(
    (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .status,
  ).toBe("approved");
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("PAID");
  expect(
    await db.auditLog.findFirst({
      where: { entityId: order.id, action: "payment.event_review" },
    }),
  ).toBeTruthy();
});
it("bloqueia regressão de status mesmo com data mais recente", async () => {
  response(100);
  await syncPayment("123");
  response(100, "pending", "2026-10-29T13:00:00Z");
  await syncPayment("123");
  expect(
    (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .status,
  ).toBe("approved");
});
it("pagamento posterior a cancelamento exige análise sem confirmar entrega ou reembolsar", async () => {
  await db.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED", stockReleased: true },
  });
  response(100);
  await syncPayment("123");
  await syncPayment("123");
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("REFUNDING");
  expect(
    await db.orderEvent.count({ where: { orderId: order.id, status: "PAID" } }),
  ).toBe(0);
  expect(await db.mail.count({ where: { recipient: order.email } })).toBe(1);
  expect(
    await db.auditLog.findFirst({
      where: { entityId: order.id, action: "payment.late_approval" },
    }),
  ).toBeTruthy();
});
it("um segundo pagamento não substitui a transação financeira já confirmada", async () => {
  response(100);
  await syncPayment("123");
  response(100, "refunded", "2026-10-29T13:00:00Z", "outro-pagamento");
  await syncPayment("456");
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("PAID");
  expect(
    (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .providerId,
  ).toBe("test-" + order.id);
});
it("rejeita status ou data inválidos sem registrar transação", async () => {
  response(100, "inventado");
  await expect(syncPayment("123")).rejects.toThrow("inválida");
  response(100, "approved", "data inválida");
  await expect(syncPayment("123")).rejects.toThrow("inválida");
  expect(
    await db.paymentTransaction.count({
      where: { payment: { orderId: order.id } },
    }),
  ).toBe(0);
});
it("reembolso terminal não é desfeito por nova aprovação", async () => {
  response(100);
  await syncPayment("123");
  response(100, "refunded", "2026-10-29T13:00:00Z");
  await syncPayment("123");
  response(100, "approved", "2026-10-29T14:00:00Z");
  await syncPayment("123");
  expect(
    (await db.payment.findUniqueOrThrow({ where: { orderId: order.id } }))
      .status,
  ).toBe("refunded");
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("REFUNDING");
});

it("atualização repetida de aprovação tardia não duplica aviso nem altera estoque", async () => {
  const stocks = await db.variant.findMany({
    select: { id: true, stock: true },
    orderBy: { id: "asc" },
  });
  await db.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED", stockReleased: true },
  });
  response(100);
  await syncPayment("123");
  response(100, "approved", "2026-10-29T14:00:00Z");
  await syncPayment("123");
  expect(await db.mail.count({ where: { recipient: order.email } })).toBe(1);
  expect(
    await db.variant.findMany({
      select: { id: true, stock: true },
      orderBy: { id: "asc" },
    }),
  ).toEqual(stocks);
});
