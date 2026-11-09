import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
import { encrypt } from "../../src/lib/encryption";
const origin = "http://localhost:3000";
test("administrador envia capa e galeria, define cor, preço e estoque por tamanho", async ({
  page,
  context,
  browser,
}) => {
  const name = "Produto foto teste " + randomUUID().slice(0, 8),
    slug = "upload-" + randomUUID(),
    raw = randomUUID();
  const admin = await db.user.create({
    data: {
      email: slug + "@example.invalid",
      name: "Admin catálogo teste",
      passwordHash: "unused-fixture",
      role: "ADMIN",
      verified: true,
      mfaEnabled: true,
      mfaSecret: encrypt("JBSWY3DPEHPK3PXP"),
    },
  });
  await db.session.create({
    data: {
      id: hash(raw),
      userId: admin.id,
      expiresAt: new Date(Date.now() + 3600000),
      mfaVerifiedAt: new Date(),
    },
  });
  await context.addCookies([
    {
      name: "elite_session",
      value: raw,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const png = await sharp({
    create: { width: 40, height: 40, channels: 3, background: "orange" },
  })
    .png()
    .toBuffer();
  const assets: string[] = [];
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/admin/uploads") && response.ok()) {
      const value = await response.json();
      if (value.url?.startsWith("/images/uploads/"))
        assets.push(value.url.split("/").pop().slice(0, -5));
    }
  });
  const guest = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await guest.request.post("/api/admin/uploads", {
          headers: { Origin: origin, "Content-Type": "image/png" },
          data: png,
        })
      ).status(),
    ).toBe(401);
    await page.goto("/admin");
    const consent = page.getByRole("button", {
      name: "Somente essenciais",
      exact: true,
    });
    if (await consent.isVisible()) await consent.click();
    await page
      .getByRole("button", { name: "Produtos e estoque", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Novo produto", exact: true })
      .click();
    const form = page.locator("form").filter({
      has: page.getByRole("heading", {
        name: "Cadastrar produto",
        exact: true,
      }),
    });
    await form
      .getByLabel("Enviar imagem (JPEG, PNG ou WebP, até 5 MB)", {
        exact: true,
      })
      .setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: png });
    await expect(
      form.getByLabel("Endereço da foto (preenchido ao enviar)", {
        exact: true,
      }),
    ).toHaveValue(/^\/images\/uploads\//);
    for (const [label, value] of [
      ["Nome", name],
      ["URL amigável", slug],
      ["Linha/modelo", "Linha teste"],
      ["Cor", "Laranja"],
      ["Material", "Especificação de teste"],
      ["Solado", "FG"],
      ["Preço em reais", "380"],
      ["Numerações separadas por vírgula", "39,40"],
      ["Estoque por tamanho", "0"],
      ["Peso embalado (g)", "800"],
      ["Largura embalagem (cm)", "22"],
      ["Altura embalagem (cm)", "12"],
      ["Comprimento embalagem (cm)", "35"],
      [
        "Descrição",
        "Produto inteiramente fictício para testar o cadastro administrativo.",
      ],
    ])
      await form.getByLabel(label, { exact: true }).fill(value);
    await form
      .getByRole("button", { name: "Salvar produto", exact: true })
      .click();
    await expect
      .poll(async () =>
        Boolean(await db.product.findUnique({ where: { slug } })),
      )
      .toBe(true);
    expect(
      (await db.product.findUniqueOrThrow({ where: { slug } })).active,
    ).toBe(false);
    const search = page.getByLabel("Buscar produto por nome, modelo ou cor", {
      exact: true,
    });
    await search.fill(name);
    await expect(page.locator("details.product-editor")).toHaveCount(1);
    await search.fill("nenhum-produto-teste-cor");
    await expect(page.locator("details.product-editor")).toHaveCount(0);
    await search.fill(name);
    const editor = page
      .locator("details.product-editor")
      .filter({ has: page.locator("summary", { hasText: name }) });
    await editor.locator(":scope > summary").click();
    await editor.getByLabel(/Adicionar várias fotos desta cor/).setInputFiles([
      { name: "lateral.png", mimeType: "image/png", buffer: png },
      { name: "traseira.png", mimeType: "image/png", buffer: png },
    ]);
    await expect(editor.locator(".gallery-row")).toHaveCount(3);
    await editor
      .getByRole("button", { name: "Salvar produto e galeria", exact: true })
      .click();
    await expect
      .poll(async () => db.productImage.count({ where: { product: { slug } } }))
      .toBe(3);
    await expect(editor).not.toHaveAttribute("open", "");
    await editor.locator(":scope > summary").click();
    const variation = editor
      .locator(".variant-editor")
      .filter({ has: page.getByText("BR 39", { exact: true }) });
    await variation
      .getByLabel("Ajuste de estoque tamanho 39", { exact: true })
      .fill("2");
    await variation
      .getByRole("button", { name: "Ajustar estoque", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.variant.findFirstOrThrow({
              where: { size: 39, product: { slug } },
            })
          ).stock,
      )
      .toBe(2);
    const product = await db.product.findUniqueOrThrow({
      where: { slug },
      include: { images: true, variants: true },
    });
    expect(product.color).toBe("Laranja");
    expect(product.price).toBe(38000);
    expect(product.variants.find((v) => v.size === 40)?.stock).toBe(0);
    const image = await guest.request.get(product.images[0].url);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/webp");
  } finally {
    await guest.close();
    const product = await db.product.findUnique({ where: { slug } });
    await db.auditLog.deleteMany({ where: { actorId: admin.id } });
    if (product) await db.product.delete({ where: { id: product.id } });
    await db.mediaAsset.deleteMany({ where: { id: { in: assets } } });
    await db.session.deleteMany({ where: { userId: admin.id } });
    await db.user.delete({ where: { id: admin.id } });
  }
});
