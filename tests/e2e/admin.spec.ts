import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { db } from "../../src/lib/db";
import { encrypt } from "../../src/lib/encryption";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
const secret = "JBSWY3DPEHPK3PXP";
test("MFA, permissões, cadastro de produto, estoque e exportação", async ({
  request,
  page,
  context,
}) => {
  const password = "Admin-Test-Password-123!";
  const address = `admin-${randomUUID()}@example.invalid`;
  const u = await db.user.create({
    data: {
      email: address,
      name: "Admin de teste",
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      verified: true,
      mfaEnabled: true,
      mfaSecret: encrypt(secret),
    },
  });
  let productId: string | undefined;
  let campaignId: string | undefined, bannerId: string | undefined;
  try {
    const noCode = await request.post("/api/auth/login", {
      headers: { Origin: "http://localhost:3000" },
      data: { email: address, password },
    });
    expect(noCode.status()).toBe(401);
    const code = new TOTP({
      secret: Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    }).generate();
    const login = await request.post("/api/auth/login", {
      headers: { Origin: "http://localhost:3000" },
      data: { email: address, password, code },
    });
    expect(login.status()).toBe(200);
    const dash = await request.get("/api/admin/dashboard");
    expect(dash.status()).toBe(200);
    const data = await dash.json();
    const slug = "test-product-" + randomUUID();
    const created = await request.post("/api/admin/products", {
      headers: { Origin: "http://localhost:3000" },
      data: {
        name: "Produto teste " + slug.slice(-8),
        slug,
        brandId: data.brands[0].id,
        categoryId: data.categories[0].id,
        model: "Teste",
        color: "Preto",
        ground: "Campo",
        description:
          "Produto temporário para teste de integração administrativa.",
        material: "Sintético",
        sole: "FG",
        price: 10000,
        demo: true,
        active: false,
        image: "https://example.invalid/test.jpg",
        weightGrams: 800,
        widthCm: 22,
        heightCm: 12,
        lengthCm: 35,
        variants: [{ size: 40, stock: 2, sku: slug + "-40" }],
      },
    });
    expect(created.status()).toBe(200);
    productId = (await created.json()).id;
    const variant = await db.variant.findFirstOrThrow({ where: { productId } });
    const stock = await request.patch("/api/admin/stock/" + variant.id, {
      headers: { Origin: "http://localhost:3000" },
      data: { delta: -3 },
    });
    expect(stock.status()).toBe(409);
    expect(
      (await request.get("/api/admin/export?format=xlsx")).headers()[
        "content-type"
      ],
    ).toContain("spreadsheetml");
    const csv = await request.get("/api/admin/export");
    expect(csv.status()).toBe(200);
    const product = await db.product.findUniqueOrThrow({
      where: { id: productId },
      include: { images: true },
    });
    const { id, createdAt, slug: productSlug, demo, ...fields } = product;
    const edit = await request.patch("/api/admin/products/" + productId, {
      headers: { Origin: "http://localhost:3000" },
      data: {
        ...fields,
        images: [
          ...product.images,
          {
            url: "/images/boot-1.svg",
            alt: "Segunda imagem autorizada de teste",
          },
        ],
      },
    });
    expect(edit.status()).toBe(200);
    const stale = await request.patch("/api/admin/products/" + productId, {
      headers: { Origin: "http://localhost:3000" },
      data: { ...fields, images: product.images },
    });
    expect(stale.status()).toBe(409);
    await context.addCookies((await request.storageState()).cookies);
    await page.goto("/admin");
    const consent = page.getByRole("button", {
      name: "Somente essenciais",
      exact: true,
    });
    if (await consent.isVisible()) await consent.click();
    await page
      .getByRole("button", { name: "Produtos e estoque", exact: true })
      .click();
    const editor = page
      .locator("details.product-editor")
      .filter({ hasText: product.name });
    await editor.locator("summary").first().click();
    await editor
      .getByRole("button", { name: "Mover imagem 2 para cima", exact: true })
      .click();
    await editor
      .getByRole("button", { name: "Salvar produto e galeria", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Alteração salva");
    const cover = await db.productImage.findFirstOrThrow({
      where: { productId },
      orderBy: { position: "asc" },
    });
    expect(cover.url).toBe("/images/boot-1.svg");
    const newSize = await request.post(
      "/api/admin/products/" + productId + "/variants",
      {
        headers: { Origin: "http://localhost:3000" },
        data: { size: 41, sku: slug + "-41", stock: 2 },
      },
    );
    expect(newSize.status()).toBe(201);
    const variation = await newSize.json();
    expect(
      (
        await request.patch("/api/admin/variants/" + variation.id, {
          headers: { Origin: "http://localhost:3000" },
          data: { version: 0, sku: slug + "-41", active: false },
        })
      ).status(),
    ).toBe(200);
    const range = await request.get(
      "/api/admin/reports?from=2031-04-01&to=2031-04-01",
    );
    expect(range.status()).toBe(200);
    expect((await range.json()).daily).toHaveLength(1);
    const schedule = {
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
    };
    const campaignResult = await request.post("/api/admin/campaigns", {
      headers: { Origin: "http://localhost:3000" },
      data: {
        name: "Campanha " + slug,
        active: false,
        couponCode: null,
        ...schedule,
      },
    });
    expect(campaignResult.status()).toBe(201);
    campaignId = (await campaignResult.json()).id;
    const bannerPayload = {
      title: slug,
      subtitle: "Teste",
      image: "/images/boot-0.svg",
      imageAlt: "Ilustração de teste autorizada",
      ctaLabel: "Explorar",
      href: "/catalogo",
      position: 0,
      active: true,
      campaignId,
      ...schedule,
    };
    const bannerResult = await request.post("/api/admin/banners", {
      headers: { Origin: "http://localhost:3000" },
      data: bannerPayload,
    });
    expect(bannerResult.status()).toBe(201);
    bannerId = (await bannerResult.json()).id;
    expect(
      (await (await request.get("/api/banners")).json()).some(
        (b: any) => b.id === bannerId,
      ),
    ).toBe(false);
    expect(
      (
        await request.put("/api/admin/banners/" + bannerId, {
          headers: { Origin: "http://localhost:3000" },
          data: { ...bannerPayload, version: 0, title: "Banner revisado" },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.put("/api/admin/banners/" + bannerId, {
          headers: { Origin: "http://localhost:3000" },
          data: { ...bannerPayload, version: 0 },
        })
      ).status(),
    ).toBe(409);
    await page.reload();
    await page
      .getByRole("button", { name: "Banners e campanhas", exact: true })
      .click();
    const campaignEditor = page.locator("details.panel").filter({
      has: page.locator("summary", { hasText: "Campanha " + slug }),
    });
    await campaignEditor.locator("summary").click();
    await campaignEditor
      .getByLabel("Nome da campanha", { exact: true })
      .fill("Campanha " + slug + " revisada");
    await campaignEditor
      .getByRole("button", { name: "Salvar alterações", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Alteração salva");
    expect(
      (await db.campaign.findUniqueOrThrow({ where: { id: campaignId } })).name,
    ).toContain("revisada");
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Faturamento diário", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/elite-report-" + test.info().project.name + ".png",
      fullPage: true,
    });
    await db.user.update({ where: { id: u.id }, data: { role: "AGENT" } });
    const denied = await request.post("/api/admin/products", {
      headers: { Origin: "http://localhost:3000" },
      data: {},
    });
    expect(denied.status()).toBe(403);
  } finally {
    if (bannerId) await db.banner.delete({ where: { id: bannerId } });
    if (campaignId) await db.campaign.delete({ where: { id: campaignId } });
    if (productId) {
      await db.productImage.deleteMany({ where: { productId } });
      await db.variant.deleteMany({ where: { productId } });
      await db.product.delete({ where: { id: productId } });
    }
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
    await db.auditLog.deleteMany({ where: { actorId: u.id } });
  }
});
