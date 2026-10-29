import { test, expect } from "@playwright/test";
test("catálogo, produto, estoque e persistência de carrinho", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "SEU JOGO.",
  );
  await expect(page.locator("body")).toContainText("VENDAS DESATIVADAS");
  await page.getByRole("button", { name: "Somente essenciais" }).click();
  await page.getByRole("link", { name: "ENCONTRE SUA CHUTEIRA" }).click();
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.locator(".product-card").first().locator("h3").click();
  await expect(page.locator(".product-purchase h1")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tamanho 37 indisponível", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Tamanho 40", exact: true }).click();
  await page.getByRole("button", { name: "ADICIONAR AO CARRINHO" }).click();
  await expect(page.getByRole("status")).toContainText("adicionado");
  await page.getByRole("link", { name: /Carrinho com/ }).click();
  await expect(page.locator(".cart-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".cart-row")).toHaveCount(1);
  await page.getByLabel("Código do cupom").fill("ELITE10");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cupom aplicado");
  await page
    .getByRole("link", { name: "FINALIZAR COMPRA", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Finalize sua compra." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("filtros combinados e estado vazio", async ({ page }) => {
  await page.goto("/catalogo?category=campo&size=40&sort=price-asc");
  await expect(page.locator(".product-card")).toHaveCount(3);
  await page.goto("/catalogo?q=produto-inexistente");
  await expect(
    page.getByRole("heading", { name: "Nenhum par por aqui." }),
  ).toBeVisible();
});
test("rotas administrativas bloqueadas e proteção CSRF", async ({
  request,
}) => {
  const r = await request.get("/api/admin/dashboard");
  expect(r.status()).toBe(401);
  const csrf = await request.post("/api/auth/login", {
    headers: { Origin: "https://evil.invalid" },
    data: { email: "test@example.invalid", password: "invalid" },
  });
  expect(csrf.status()).toBe(403);
  const webhook = await request.post("/api/webhooks/mercadopago?data.id=1", {
    data: {},
  });
  expect([401, 503]).toContain(webhook.status());
});
test("cadastro e login real sem acesso ao painel", async ({ page }) => {
  await page.goto("/conta");
  await page
    .getByRole("button", { name: "Ainda não tem conta? Cadastre-se" })
    .click();
  const email = `e2e-${Date.now()}-${Math.random()}@example.invalid`;
  await page.getByLabel("Nome completo").fill("Cliente Teste");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Senha-Segura-123!");
  await page.getByRole("button", { name: "CRIAR MINHA CONTA" }).click();
  await expect(page.getByRole("status")).toContainText("e-mail de confirmação");
  await page.getByRole("button", { name: "Já tenho conta" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Senha-Segura-123!");
  await page.getByRole("button", { name: "ENTRAR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Olá, Cliente." }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Confirme seu acesso." }),
  ).toBeVisible();
});
test("checkout demonstração não aceita valores enviados pelo navegador", async ({
  request,
}) => {
  const catalog = await (await request.get("/api/catalog")).json();
  const variant = catalog.products[0].variants.find((v: any) => v.stock > 0);
  const r = await request.post("/api/checkout", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      items: [{ variantId: variant.id, quantity: 1, price: 1 }],
      shippingId: "1",
      email: "guest@example.invalid",
      name: "Cliente Fictício",
      phone: "11999999999",
      address: {
        postcode: "01001000",
        street: "Rua de teste",
        number: "1",
        district: "Centro",
        city: "São Paulo",
        state: "SP",
      },
      idempotencyKey: crypto.randomUUID(),
      total: 1,
    },
  });
  expect(r.status()).toBe(503);
  expect((await r.json()).error).toContain("Compras reais estão desativadas");
});
