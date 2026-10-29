import { vi, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
const fixture = vi.hoisted(() => ({
  cookie: "checkout-test-client-" + Math.random(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "elite_cart" ? { value: fixture.cookie } : undefined,
    set: vi.fn(),
  }),
}));
vi.mock("../src/lib/commerce", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/lib/commerce")>();
  return {
    ...original,
    settings: async () => ({ salesEnabled: true }),
    shipping: async () => [
      { id: "1", name: "Transportadora de teste", price: 1000, days: 3 },
    ],
  };
});
vi.mock("../src/lib/payments", () => ({ mp: vi.fn() }));
import { mp } from "../src/lib/payments";
import { db } from "../src/lib/db";
import { createCheckout } from "../src/lib/checkout";
let product: any, variant: any;
const orders: string[] = [];
const recipient = "checkout-fixture-" + randomUUID() + "@example.invalid";
beforeAll(async () => {
  const [brand, category] = await Promise.all([
    db.brand.findFirstOrThrow(),
    db.category.findFirstOrThrow(),
  ]);
  product = await db.product.create({
    data: {
      name: "Fixture de checkout",
      slug: "checkout-fixture-" + randomUUID(),
      brandId: brand.id,
      categoryId: category.id,
      model: "TEST",
      color: "Preto",
      ground: "Campo",
      description: "Produto temporário isolado para testar checkout.",
      material: "TEST",
      sole: "FG",
      price: 10000,
      demo: false,
      variants: { create: { size: 40, stock: 4, sku: randomUUID() } },
    },
    include: { variants: true },
  });
  variant = product.variants[0];
});
beforeEach(() => {
  process.env.DEMO_MODE = "false";
  process.env.MP_ACCESS_TOKEN = "TEST-MOCKED";
  process.env.MP_WEBHOOK_SECRET = "TEST-MOCKED";
  process.env.MP_COLLECTOR_ID = "123";
  process.env.SMTP_HOST = "smtp.example.invalid";
  process.env.MFA_ENCRYPTION_KEY = "cd".repeat(32);
});
afterAll(async () => {
  await db.mail.deleteMany({ where: { recipient } });
  for (const id of orders) {
    await db.payment.deleteMany({ where: { orderId: id } });
    await db.orderEvent.deleteMany({ where: { orderId: id } });
    await db.orderItem.deleteMany({ where: { orderId: id } });
    await db.order.delete({ where: { id } });
  }
  await db.variant.deleteMany({ where: { productId: product.id } });
  await db.product.delete({ where: { id: product.id } });
  await db.$disconnect();
});
function payload() {
  return {
    items: [{ variantId: variant.id, quantity: 1 }],
    shippingId: "1",
    name: "Cliente de Teste",
    email: recipient,
    phone: "11999999999",
    address: {
      postcode: "01001000",
      street: "Rua de Teste",
      number: "1",
      district: "Centro",
      city: "São Paulo",
      state: "SP",
    },
    idempotencyKey: randomUUID(),
  };
}
it("cria pedido com valor do servidor e reusa a mesma preferência sem nova reserva", async () => {
  vi.mocked(mp).mockResolvedValue({
    id: "test-pref",
    init_point: "https://www.mercadopago.com.br/checkout/test",
  });
  const d = payload();
  const first = await createCheckout({ ...d, total: 1 });
  orders.push(first.body.id);
  expect(first.status).toBe(201);
  expect(
    (await db.order.findUniqueOrThrow({ where: { id: first.body.id } })).total,
  ).toBe(11000);
  expect(
    (await db.variant.findUniqueOrThrow({ where: { id: variant.id } })).stock,
  ).toBe(3);
  const repeated = await createCheckout(d);
  expect(repeated.body.id).toBe(first.body.id);
  expect(repeated.body.access).toBe(first.body.access);
  expect(vi.mocked(mp)).toHaveBeenCalledTimes(1);
  await expect(createCheckout({ ...d, name: "Outro nome" })).rejects.toThrow(
    /dados alterados/,
  );
  const original = fixture.cookie;
  fixture.cookie = "different-client";
  await expect(createCheckout(d)).rejects.toThrow();
  fixture.cookie = original;
});
it("preserva acesso do visitante e não recria preferência após timeout", async () => {
  vi.mocked(mp).mockClear();
  vi.mocked(mp).mockRejectedValue(new Error("provider timeout"));
  const d = payload();
  const first = await createCheckout(d);
  orders.push(first.body.id);
  expect(first.status).toBe(202);
  expect(first.body.access).toBeTruthy();
  const repeated = await createCheckout(d);
  expect(repeated.status).toBe(202);
  expect(repeated.body.id).toBe(first.body.id);
  expect(repeated.body.access).toBe(first.body.access);
  expect(vi.mocked(mp)).toHaveBeenCalledTimes(1);
  expect(
    await db.mail.count({
      where: { recipient, body: { contains: first.body.id } },
    }),
  ).toBe(1);
});
