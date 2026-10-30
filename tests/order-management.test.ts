import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { listOrders, orderDetail } from "../src/lib/order-management";
const prefix = "orders-test-" + randomUUID();
const ids: string[] = [];
const base = {
  accessHash: "PRIVATE-HASH",
  accessCipher: "PRIVATE-CIPHER",
  clientHash: "PRIVATE-CLIENT",
  requestHash: "PRIVATE-REQUEST",
  email: prefix + "@example.invalid",
  name: prefix,
  phone: "11999999999",
  address: { street: "Rua fictícia", number: "10" },
  subtotal: 10000,
  discount: 0,
  shipping: 0,
  total: 10000,
  shippingService: "TEST",
  expiresAt: new Date(),
};
beforeAll(async () => {
  const many = Array.from({ length: 201 }, (_, i) => ({
    id: prefix + "-" + String(i).padStart(3, "0"),
    ...base,
    idempotencyKey: randomUUID(),
    status: "PAID" as const,
    createdAt: new Date("2026-10-02T12:00:00Z"),
  }));
  ids.push(...many.map((o) => o.id));
  await db.order.createMany({ data: many });
  const variant = await db.variant.findFirstOrThrow();
  const oldest = await db.order.create({
    data: {
      id: prefix + "-old",
      ...base,
      idempotencyKey: randomUUID(),
      status: "DELIVERED",
      createdAt: new Date("2020-01-01T12:00:00Z"),
      items: {
        create: {
          variantId: variant.id,
          name: "Produto teste",
          size: variant.size,
          quantity: 1,
          price: 10000,
        },
      },
      payment: { create: { providerId: prefix, status: "approved" } },
      shipment: {
        create: { carrier: "TEST", trackingCode: prefix + "-TRACK" },
      },
      events: {
        create: { status: "DELIVERED", note: "Entrega fictícia para teste." },
      },
    },
  });
  ids.push(oldest.id);
  for (const [i, createdAt] of [
    "2026-10-01T02:59:59Z",
    "2026-10-01T03:00:00Z",
    "2026-10-02T02:59:59Z",
    "2026-10-02T03:00:00Z",
  ].entries()) {
    const order = await db.order.create({
      data: {
        ...base,
        idempotencyKey: randomUUID(),
        name: prefix + "-boundary",
        status: "PENDING",
        createdAt: new Date(createdAt),
      },
    });
    ids.push(order.id);
  }
});
afterAll(async () => {
  const where = { orderId: { in: ids } };
  await db.orderEvent.deleteMany({ where });
  await db.shipment.deleteMany({ where });
  await db.payment.deleteMany({ where });
  await db.orderItem.deleteMany({ where });
  await db.order.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
it("pagina além dos últimos 200 pedidos sem repetir IDs empatados por data", async () => {
  const first = await listOrders({ q: prefix, status: "PAID", pageSize: 50 });
  expect(first.total).toBe(201);
  expect(first.pages).toBe(5);
  const pages = await Promise.all(
    [1, 2, 3, 4, 5].map((page) =>
      listOrders({ q: prefix, status: "PAID", pageSize: 50, page }),
    ),
  );
  const values = pages.flatMap((p) => p.orders.map((o) => o.id));
  expect(values).toHaveLength(201);
  expect(new Set(values).size).toBe(201);
  expect(
    (await listOrders({ q: prefix, status: "PAID", pageSize: 50, page: 999 }))
      .page,
  ).toBe(5);
});
it("encontra pedido antigo por ID, e-mail e rastreio combinando situação", async () => {
  for (const q of [prefix + "-old", prefix + "-TRACK", prefix.toUpperCase()]) {
    const result = await listOrders({ q, status: "DELIVERED" });
    expect(result.orders.map((o) => o.id)).toEqual([prefix + "-old"]);
  }
  const result = await listOrders({ q: base.email, status: "DELIVERED" });
  expect(result.total).toBe(1);
});
it("filtra datas em Brasília inclusive no último segundo do dia", async () => {
  const result = await listOrders({
    q: prefix + "-boundary",
    from: "2026-10-01",
    to: "2026-10-01",
  });
  expect(result.total).toBe(2);
  expect(
    result.orders.every(
      (o) =>
        o.createdAt >= new Date("2026-10-01T03:00:00Z") &&
        o.createdAt < new Date("2026-10-02T03:00:00Z"),
    ),
  ).toBe(true);
});
it("lista vazia mantém paginação utilizável", async () => {
  const result = await listOrders({ q: prefix + "-nada", page: 999 });
  expect(result.total).toBe(0);
  expect(result.page).toBe(1);
  expect(result.orders).toEqual([]);
});
it("recusa datas incompletas, período invertido e filtros fora dos limites", async () => {
  for (const input of [
    { from: "2026-10-01" },
    { from: "2026-02-30", to: "2026-03-01" },
    { from: "2026-10-02", to: "2026-10-01" },
    { page: -1 },
    { pageSize: 500 },
    { q: "a".repeat(101) },
    { status: "inventado" },
  ])
    await expect(listOrders(input)).rejects.toThrow();
});
it("retorna detalhe operacional sem tokens, ciphertexts ou chave de idempotência", async () => {
  const detail = await orderDetail(prefix + "-old");
  expect(detail.items).toHaveLength(1);
  expect(detail.items[0].variant.sku).toBeTruthy();
  expect(detail.events).toHaveLength(1);
  const result = await listOrders({ q: prefix + "-old" });
  for (const value of [detail, result.orders[0]])
    for (const key of [
      "accessHash",
      "accessCipher",
      "clientHash",
      "requestHash",
      "idempotencyKey",
    ])
      expect(value).not.toHaveProperty(key);
  expect(JSON.stringify(detail)).not.toContain("PRIVATE-");
  expect(result.orders[0]).not.toHaveProperty("address");
});
it("pedido inexistente retorna erro controlado", async () => {
  await expect(orderDetail("missing-" + randomUUID())).rejects.toThrow(
    "não encontrado",
  );
});
