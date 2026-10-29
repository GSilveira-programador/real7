import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID, createHmac } from "node:crypto";
import { db } from "../src/lib/db";
import { quote, releaseOrder, discountFor } from "../src/lib/commerce";
import { cartSchema, password, checkoutSchema } from "../src/lib/validation";
import { verifyWebhook } from "../src/lib/payments";
import { hash } from "../src/lib/security";
const ids: string[] = [];
let v: any;
beforeAll(async () => {
  v = await db.variant.findFirstOrThrow({
    where: { stock: { gt: 0 } },
    include: { product: true },
  });
});
afterAll(async () => {
  for (const id of ids) {
    await db.orderEvent.deleteMany({ where: { orderId: id } });
    await db.orderItem.deleteMany({ where: { orderId: id } });
    await db.order.deleteMany({ where: { id } });
  }
  await db.$disconnect();
});
describe("Validação e cálculo", () => {
  it("rejeita quantidades inválidas e variações duplicadas", () => {
    expect(() =>
      cartSchema.parse([{ variantId: "a", quantity: -1 }]),
    ).toThrow();
    expect(() =>
      cartSchema.parse([
        { variantId: "a", quantity: 1 },
        { variantId: "a", quantity: 1 },
      ]),
    ).toThrow();
  });
  it("exige senha forte sem truncamento bcrypt", () => {
    expect(() => password.parse("123456789")).toThrow();
    expect(() => password.parse("🔐".repeat(20))).toThrow();
    expect(password.parse("Senha-com-12-caracteres")).toBeTruthy();
  });
  it("calcula desconto em centavos sem valores de ponto flutuante", () =>
    expect(discountFor(9999, 10)).toBe(999));
  it("ignora preço manipulado pelo cliente", async () => {
    const q = await quote([{ variantId: v.id, quantity: 2, price: 1 }]);
    expect(q.subtotal).toBe(v.product.price * 2);
  });
  it("aplica cupom válido e rejeita cupom inexistente", async () => {
    const q = await quote([{ variantId: v.id, quantity: 1 }], "ELITE10");
    expect(q.discount).toBe(discountFor(q.subtotal, 10));
    await expect(
      quote([{ variantId: v.id, quantity: 1 }], "INVALID"),
    ).rejects.toThrow();
  });
  it("rejeita estoque indisponível", async () => {
    const empty = await db.variant.findFirstOrThrow({ where: { stock: 0 } });
    await expect(quote([{ variantId: empty.id, quantity: 1 }])).rejects.toThrow(
      /indisponível/,
    );
  });
  it("exige checkout válido e chave idempotente", () =>
    expect(() =>
      checkoutSchema.parse({ items: [], email: "invalid" }),
    ).toThrow());
});
describe("Estoque PostgreSQL", () => {
  it("impede overselling em duas transações simultâneas", async () => {
    const test = await db.variant.create({
      data: {
        productId: v.productId,
        size: 45,
        sku: "TEST-" + randomUUID(),
        stock: 1,
      },
    });
    try {
      const results = await Promise.all(
        [1, 2].map(() =>
          db.$transaction(async (tx) =>
            tx.variant.updateMany({
              where: { id: test.id, stock: { gte: 1 } },
              data: { stock: { decrement: 1 } },
            }),
          ),
        ),
      );
      expect(results.reduce((n, r) => n + r.count, 0)).toBe(1);
      expect(
        (await db.variant.findUniqueOrThrow({ where: { id: test.id } })).stock,
      ).toBe(0);
      await expect(
        db.variant.update({ where: { id: test.id }, data: { stock: -1 } }),
      ).rejects.toThrow();
    } finally {
      await db.variant.delete({ where: { id: test.id } });
    }
  });
  it("libera reserva uma única vez após cancelamento confirmado", async () => {
    const before = await db.variant.findUniqueOrThrow({ where: { id: v.id } });
    await db.variant.update({
      where: { id: v.id },
      data: { stock: { decrement: 1 } },
    });
    const o = await db.order.create({
      data: {
        accessHash: hash(randomUUID()),
        idempotencyKey: randomUUID(),
        email: "test@example.invalid",
        name: "Teste",
        phone: "11999999999",
        address: {},
        subtotal: v.product.price,
        discount: 0,
        shipping: 0,
        total: v.product.price,
        shippingService: "TEST",
        expiresAt: new Date(),
        items: {
          create: {
            variantId: v.id,
            name: "TEST",
            size: v.size,
            quantity: 1,
            price: v.product.price,
          },
        },
      },
    });
    ids.push(o.id);
    expect(await releaseOrder(o.id)).toBe(true);
    expect(await releaseOrder(o.id)).toBe(false);
    expect(
      (await db.variant.findUniqueOrThrow({ where: { id: v.id } })).stock,
    ).toBe(before.stock);
  });
});
describe("Assinatura do webhook", () => {
  it("rejeita assinatura ausente e falsa", () => {
    process.env.MP_WEBHOOK_SECRET = "test-only";
    expect(() =>
      verifyWebhook(new Request("http://localhost"), "123"),
    ).toThrow();
    expect(() =>
      verifyWebhook(
        new Request("http://localhost", {
          headers: {
            "x-request-id": "test",
            "x-signature": `ts=${Date.now()},v1=bad`,
          },
        }),
        "123",
      ),
    ).toThrow();
  });
  it("aceita HMAC válido e rejeita replays expirados", () => {
    const ts = String(Date.now());
    const id = "123";
    const key = "test-only";
    process.env.MP_WEBHOOK_SECRET = key;
    const signature = createHmac("sha256", key)
      .update(`id:${id};request-id:test;ts:${ts};`)
      .digest("hex");
    expect(() =>
      verifyWebhook(
        new Request("http://localhost", {
          headers: {
            "x-request-id": "test",
            "x-signature": `ts=${ts},v1=${signature}`,
          },
        }),
        id,
      ),
    ).not.toThrow();
    expect(() =>
      verifyWebhook(
        new Request("http://localhost", {
          headers: {
            "x-request-id": "test",
            "x-signature": `ts=1,v1=${signature}`,
          },
        }),
        id,
      ),
    ).toThrow();
  });
});
describe("Criptografia MFA", () => {
  it("protege segredo e detecta adulteração", async () => {
    const { encrypt, decrypt } = await import("../src/lib/encryption");
    process.env.MFA_ENCRYPTION_KEY = "ab".repeat(32);
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encrypt(secret);
    expect(encrypted).not.toContain(secret);
    expect(decrypt(encrypted)).toBe(secret);
    const parts = encrypted.split(".");
    parts[1] = Buffer.from("fake-auth-tag-123").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});
