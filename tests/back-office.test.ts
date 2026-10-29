import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { editProduct, editVariant, addVariant } from "../src/lib/inventory";
import {
  activeBanners,
  bannerSchema,
  internalHref,
} from "../src/lib/merchandising";
import { salesReport, reportRange } from "../src/lib/reports";
import { quote } from "../src/lib/commerce";
let p: any, campaign: any;
const actor = "test-backoffice-" + randomUUID();
const orders: string[] = [];
const bannerIds: string[] = [];
beforeAll(async () => {
  const [brand, category] = await Promise.all([
    db.brand.findFirstOrThrow(),
    db.category.findFirstOrThrow(),
  ]);
  p = await db.product.create({
    data: {
      name: "Produto fixture administrativo",
      slug: actor,
      brandId: brand.id,
      categoryId: category.id,
      model: "Teste",
      color: "Verde",
      ground: "Campo",
      description: "Fixture temporária de integração de edição e relatórios.",
      material: "Teste",
      sole: "FG",
      price: 10000,
      demo: true,
      active: false,
      images: {
        create: {
          url: "/images/boot-0.svg",
          alt: "Ilustração de teste original",
        },
      },
      variants: { create: { size: 40, sku: actor + "-40", stock: 2 } },
    },
    include: { images: true, variants: true },
  });
  campaign = await db.campaign.create({
    data: {
      name: actor,
      active: true,
      startsAt: new Date("2031-04-01T00:00Z"),
      endsAt: new Date("2031-04-03T00:00Z"),
    },
  });
});
afterAll(async () => {
  await db.banner.deleteMany({ where: { id: { in: bannerIds } } });
  await db.campaign.delete({ where: { id: campaign.id } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
  await db.order.deleteMany({ where: { id: { in: orders } } });
  await db.productImage.deleteMany({ where: { productId: p.id } });
  await db.variant.deleteMany({ where: { productId: p.id } });
  await db.product.delete({ where: { id: p.id } });
  await db.auditLog.deleteMany({ where: { actorId: actor } });
  await db.$disconnect();
});
function payload() {
  return {
    version: 0,
    name: p.name,
    brandId: p.brandId,
    categoryId: p.categoryId,
    model: p.model,
    color: p.color,
    ground: p.ground,
    description: p.description,
    material: p.material,
    sole: p.sole,
    weightGrams: 800,
    widthCm: 22,
    heightCm: 12,
    lengthCm: 35,
    price: 12000,
    compareAt: 15000,
    active: false,
    featured: true,
    images: [
      {
        id: p.images[0].id,
        url: "/images/boot-1.svg",
        alt: "Imagem de capa de teste",
      },
      { url: "/images/boot-2.svg", alt: "Segunda imagem de teste" },
    ],
  };
}
describe("Catálogo administrativo", () => {
  it("salva metadados e galeria atomicamente e detecta versão obsoleta", async () => {
    const updated = await editProduct(p.id, payload(), actor);
    expect(updated.price).toBe(12000);
    expect(updated.version).toBe(1);
    expect(updated.images.map((i) => i.position)).toEqual([0, 1]);
    expect(updated.images[0].url).toBe("/images/boot-1.svg");
    await expect(editProduct(p.id, payload(), actor)).rejects.toThrow(
      /outro operador/,
    );
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).price,
    ).toBe(12000);
  });
  it("não permite usar imagem de outro produto nem preço promocional inválido", async () => {
    await expect(
      editProduct(
        p.id,
        {
          ...payload(),
          version: 1,
          images: [
            {
              id: "foreign-image",
              url: "/images/boot-1.svg",
              alt: "Imagem que não pertence",
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow(/não pertence/);
    await expect(
      editProduct(p.id, { ...payload(), version: 1, compareAt: 100 }, actor),
    ).rejects.toThrow();
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: p.id } })).version,
    ).toBe(1);
  });
  it("arquiva variação sem apagar estoque/histórico e impede compra", async () => {
    const v = await addVariant(
      p.id,
      { size: 41, sku: actor + "-41", stock: 3 },
      actor,
    );
    await db.product.update({ where: { id: p.id }, data: { active: true } });
    const updated = await editVariant(
      v.id,
      { version: 0, sku: actor + "-SKU", active: false },
      actor,
    );
    expect(updated.stock).toBe(3);
    expect(updated.version).toBe(1);
    await expect(quote([{ variantId: v.id, quantity: 1 }])).rejects.toThrow(
      /indisponível/,
    );
    await expect(
      editVariant(
        v.id,
        { version: 0, sku: "invalid-stale", active: true },
        actor,
      ),
    ).rejects.toThrow();
    await db.product.update({ where: { id: p.id }, data: { active: false } });
  });
});
describe("Agendamento de conteúdo", () => {
  it("recusa links externos, javascript e cronograma invertido", () => {
    for (const value of [
      "javascript:alert(1)",
      "//example.com",
      "/\\example.com",
    ])
      expect(() => internalHref.parse(value)).toThrow();
    expect(() =>
      bannerSchema.parse({
        title: "Teste",
        subtitle: "",
        image: "/images/boot-0.svg",
        imageAlt: "Imagem de teste",
        ctaLabel: "Comprar",
        href: "/catalogo",
        position: 0,
        active: true,
        startsAt: "2031-04-03T00:00:00Z",
        endsAt: "2031-04-01T00:00:00Z",
        campaignId: null,
      }),
    ).toThrow();
  });
  it("publica somente dentro do período e respeita pausa da campanha", async () => {
    const b = await db.banner.create({
      data: {
        title: actor,
        subtitle: "Fixture",
        image: "/images/boot-0.svg",
        imageAlt: "Imagem de teste",
        ctaLabel: "Explorar",
        href: "/catalogo",
        active: true,
        startsAt: new Date("2031-04-01T00:00Z"),
        endsAt: new Date("2031-04-02T00:00Z"),
        campaignId: campaign.id,
      },
    });
    bannerIds.push(b.id);
    expect(
      (await activeBanners(new Date("2031-03-31T23:59Z"))).some(
        (v) => v.id === b.id,
      ),
    ).toBe(false);
    expect(
      (await activeBanners(new Date("2031-04-01T12:00Z"))).some(
        (v) => v.id === b.id,
      ),
    ).toBe(true);
    expect(
      (await activeBanners(new Date("2031-04-02T00:00Z"))).some(
        (v) => v.id === b.id,
      ),
    ).toBe(false);
    await db.campaign.update({
      where: { id: campaign.id },
      data: { active: false },
    });
    expect(
      (await activeBanners(new Date("2031-04-01T12:00Z"))).some(
        (v) => v.id === b.id,
      ),
    ).toBe(false);
  });
});
describe("Relatórios sem corte de 200 pedidos", () => {
  it("valida datas reais e limita intervalo", () => {
    expect(() =>
      reportRange.parse({ from: "2031-02-30", to: "2031-03-01" }),
    ).toThrow();
    expect(() =>
      reportRange.parse({ from: "2029-01-01", to: "2031-01-01" }),
    ).toThrow();
    expect(() =>
      reportRange.parse({ from: "2031-04-03", to: "2031-04-01" }),
    ).toThrow();
  });
  it("agrega todos os pedidos e usa limites do dia de Brasília", async () => {
    const now = new Date("2031-04-01T12:00Z");
    const records = Array.from({ length: 204 }, (_, i) => {
      const id = actor + "-order-" + i;
      orders.push(id);
      return {
        id,
        accessHash: "fixture",
        idempotencyKey: randomUUID(),
        email: "fixture@example.invalid",
        name: "Fixture",
        phone: "11999999999",
        address: {},
        status: i === 201 ? ("PENDING" as const) : ("PAID" as const),
        subtotal: 10000,
        discount: 0,
        shipping: 0,
        total: 10000,
        shippingService: "TEST",
        expiresAt: now,
        createdAt:
          i === 202
            ? new Date("2031-04-01T02:59:59Z")
            : i === 203
              ? new Date("2031-04-02T03:00:00Z")
              : i === 0
                ? new Date("2031-04-01T03:00:00Z")
                : now,
      };
    });
    await db.order.createMany({ data: records });
    await db.orderItem.createMany({
      data: orders.slice(0, 201).map((orderId) => ({
        orderId,
        variantId: p.variants[0].id,
        name: p.name,
        size: 40,
        quantity: 1,
        price: 10000,
      })),
    });
    const report = await salesReport({ from: "2031-04-01", to: "2031-04-01" });
    expect(report.orders).toBe(202);
    expect(report.paidOrders).toBe(201);
    expect(report.pendingOrders).toBe(1);
    expect(report.revenue).toBe(2010000);
    expect(report.averageTicket).toBe(10000);
    expect(report.daily).toEqual([
      { day: "2031-04-01", orders: 202, revenue: 2010000 },
    ]);
    expect(report.topProducts.find((v) => v.id === p.id)?.units).toBe(201);
    expect(report.conversion).toBe(null);
  });
});
