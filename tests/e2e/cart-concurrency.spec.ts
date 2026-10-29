import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
const origin = "http://localhost:3000";
async function removeCart(cookies: { name: string; value: string }[]) {
  const raw = cookies.find((c) => c.name === "elite_cart")?.value;
  if (raw) await db.cart.deleteMany({ where: { id: hash(raw) } });
}
test("leituras anônimas concorrentes não criam cookies nem substituem o carrinho gravado", async ({
  request,
}) => {
  try {
    const responses = await Promise.all([
      request.get("/api/cart"),
      request.get("/api/cart"),
    ]);
    for (const r of responses) {
      expect(r.status()).toBe(200);
      expect(r.headers()["set-cookie"]).toBeUndefined();
      expect(await r.json()).toEqual([]);
    }
    const p = (await (await request.get("/api/catalog")).json()).products[0];
    const item = { variantId: p.variants[0].id, quantity: 1 };
    expect(
      (
        await request.put("/api/cart", {
          headers: { Origin: origin },
          data: [item],
        })
      ).status(),
    ).toBe(200);
    expect(await (await request.get("/api/cart")).json()).toEqual([item]);
    expect(
      (await request.get("/api/cart")).headers()["set-cookie"],
    ).toBeUndefined();
  } finally {
    await removeCart((await request.storageState()).cookies);
  }
});
test("cotação atrasada de uma quantidade anterior não sobrescreve o total atual", async ({
  page,
}) => {
  const data = await (await page.request.get("/api/catalog")).json();
  const p = data.products.find((p: any) =>
      p.variants.some((v: any) => v.active && v.stock >= 3),
    ),
    v = p.variants.find((v: any) => v.active && v.stock >= 3);
  let release!: () => void, intercepted!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    firstHeld = new Promise<void>((r) => {
      intercepted = r;
    });
  try {
    expect(
      (
        await page.request.put("/api/cart", {
          headers: { Origin: origin },
          data: [{ variantId: v.id, quantity: 1 }],
        })
      ).status(),
    ).toBe(200);
    await page.goto("/carrinho");
    await page.getByRole("button", { name: "Somente essenciais" }).click();
    await expect(page.locator(".cart-row")).toHaveCount(1);
    await page.route("**/api/cart/quote", async (route) => {
      const body = route.request().postDataJSON(),
        response = await route.fetch();
      if (body.items.length === 1 && body.items[0].quantity === 2) {
        intercepted();
        await gate;
      }
      await route.fulfill({ response });
    });
    await page
      .getByRole("button", { name: "Aumentar " + p.name, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Carrinho com 2 itens", exact: true }),
    ).toBeVisible();
    await firstHeld;
    await page
      .getByRole("button", { name: "Aumentar " + p.name, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Carrinho com 3 itens", exact: true }),
    ).toBeVisible();
    const expected = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format((p.price * 3) / 100);
    await expect(page.locator(".summary-total strong")).toHaveText(expected);
    const delayed = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/cart/quote") &&
        r.request().postDataJSON().items[0].quantity === 2,
    );
    release();
    await delayed;
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    await expect(page.locator(".summary-total strong")).toHaveText(expected);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await removeCart(await page.context().cookies());
  }
});
test("falha ao carregar não permite sobrescrever o carrinho e pode ser recuperada", async ({
  page,
}) => {
  const data = await (await page.request.get("/api/catalog")).json();
  const p = data.products.find((p: any) =>
      p.variants.some((v: any) => v.active && v.stock >= 3),
    ),
    v = p.variants.find((v: any) => v.active && v.stock >= 3);
  let fail = true;
  try {
    await page.request.put("/api/cart", {
      headers: { Origin: origin },
      data: [{ variantId: v.id, quantity: 1 }],
    });
    await page.route("**/api/cart", (route) =>
      route.request().method() === "GET" && fail
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Falha temporária de teste." }),
          })
        : route.continue(),
    );
    await page.goto("/produto/" + p.slug);
    await page.getByRole("button", { name: "Somente essenciais" }).click();
    await expect(page.locator(".cart-load-error")).toContainText(
      "Falha temporária",
    );
    const add = page.getByRole("button", {
      name: "ADICIONAR AO CARRINHO",
      exact: true,
    });
    await expect(add).toBeDisabled();
    fail = false;
    await page
      .getByRole("button", { name: "Recarregar carrinho", exact: true })
      .click();
    await expect(add).toBeEnabled();
    await page
      .getByRole("button", { name: "Tamanho " + v.size, exact: true })
      .click();
    await add.click();
    await expect(page.getByRole("status")).toContainText("adicionado");
    expect(await (await page.request.get("/api/cart")).json()).toEqual([
      { variantId: v.id, quantity: 2 },
    ]);
  } finally {
    await page.unrouteAll({ behavior: "wait" });
    await removeCart(await page.context().cookies());
  }
});
