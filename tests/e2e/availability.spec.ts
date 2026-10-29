import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
test("cliente consegue remover tamanho arquivado sem ficar preso no carrinho", async ({
  page,
}) => {
  const [brand, category] = await Promise.all([
    db.brand.findFirstOrThrow(),
    db.category.findFirstOrThrow(),
  ]);
  const id = randomUUID();
  const product = await db.product.create({
    data: {
      name: "Produto arquivado de teste " + id.slice(0, 8),
      slug: "archived-" + id,
      brandId: brand.id,
      categoryId: category.id,
      model: "Teste",
      color: "Preto",
      ground: "Campo",
      description: "Fixture temporária para recuperação de carrinho.",
      material: "Teste",
      sole: "FG",
      price: 10000,
      demo: true,
      active: false,
      variants: {
        create: { size: 40, sku: "archived-" + id, stock: 2, active: false },
      },
    },
    include: { variants: true },
  });
  try {
    await page.goto("/carrinho");
    await expect(
      page.getByRole("heading", { name: "Seu próximo jogo começa aqui." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Somente essenciais" }).click();
    const r = await page.request.put("/api/cart", {
      headers: { Origin: "http://localhost:3000" },
      data: [{ variantId: product.variants[0].id, quantity: 1 }],
    });
    expect(r.status()).toBe(200);
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Itens indisponíveis" })
        .getByRole("alert"),
    ).toContainText("indisponível");
    await expect(page.locator(".unavailable-item")).toContainText(product.name);
    await page
      .getByRole("button", { name: "Remover " + product.name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Seu próximo jogo começa aqui." }),
    ).toBeVisible();
  } finally {
    await db.variant.deleteMany({ where: { productId: product.id } });
    await db.product.delete({ where: { id: product.id } });
  }
});
