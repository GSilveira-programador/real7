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
beforeEach(() => {
  process.env.MP_ACCESS_TOKEN = "TEST-ONLY-MOCKED";
});
function response(amount: number, status = "approved") {
  mocked.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "test-" + order.id,
      external_reference: order.id,
      currency_id: "BRL",
      transaction_amount: amount,
      status,
      date_last_updated: "2026-10-29T00:00:00Z",
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
