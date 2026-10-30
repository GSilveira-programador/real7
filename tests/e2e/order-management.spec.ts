import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
import { encrypt } from "../../src/lib/encryption";
const origin = "http://localhost:3000";
test("atendente busca histórico paginado, abre detalhes e atualiza logística com auditoria", async ({
  page,
  context,
  browser,
}) => {
  const prefix = "e2e-orders-" + randomUUID(),
    raw = randomUUID();
  const staff = await db.user.create({
    data: {
      name: "Atendente de teste",
      email: prefix + "@example.invalid",
      passwordHash: "unused-fixture",
      role: "AGENT",
      verified: true,
      mfaEnabled: true,
      mfaSecret: encrypt("JBSWY3DPEHPK3PXP"),
    },
  });
  await db.session.create({
    data: {
      id: hash(raw),
      userId: staff.id,
      mfaVerifiedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
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
  const orders = Array.from({ length: 21 }, (_, i) => ({
    id: prefix + "-" + String(i).padStart(3, "0"),
    accessHash: "secret-fixture",
    idempotencyKey: randomUUID(),
    name: prefix,
    email: prefix + "@example.invalid",
    phone: "11999999999",
    address: { street: "Rua fictícia para separação", number: "10" },
    status: "PAID" as const,
    subtotal: 10000,
    discount: 0,
    shipping: 0,
    total: 10000,
    shippingService: "TEST",
    createdAt: new Date(
      i === 0 ? "2020-01-01T12:00:00Z" : "2026-10-01T12:00:00Z",
    ),
    expiresAt: new Date(),
  }));
  await db.order.createMany({ data: orders });
  const target = orders[0].id;
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    expect((await anonymous.request.get("/api/admin/orders")).status()).toBe(
      401,
    );
    expect(
      (await anonymous.request.get("/api/admin/orders/" + target)).status(),
    ).toBe(401);
    const response = await page.request.get("/api/admin/orders?q=" + prefix);
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.total).toBe(21);
    expect(result.orders[0]).not.toHaveProperty("accessHash");
    await page.goto("/admin");
    const cookies = page.getByRole("button", {
      name: "Somente essenciais",
      exact: true,
    });
    if (await cookies.isVisible()) await cookies.click();
    await page.getByRole("button", { name: "Pedidos", exact: true }).click();
    await page.getByLabel("Buscar pedido", { exact: true }).fill(prefix);
    await page
      .getByRole("button", { name: "Filtrar pedidos", exact: true })
      .click();
    await expect(
      page.getByText("21 pedido(s) encontrado(s) · Página 1 de 2", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Próxima página de pedidos", exact: true })
      .click();
    await expect(
      page.getByText("21 pedido(s) encontrado(s) · Página 2 de 2", {
        exact: true,
      }),
    ).toBeVisible();
    const card = page.locator("details.panel").filter({
      has: page.locator("summary", { hasText: "#" + target.slice(-8) }),
    });
    await card.locator("summary").click();
    await expect(
      card.getByText("Rua fictícia para separação, 10", { exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: "Atualizar logística", exact: true })
      .click();
    await expect(card.locator("summary")).toContainText("Em preparação");
    await card.locator("summary").click();
    await expect(
      card.getByRole("heading", { name: "Histórico do pedido", exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText("Atualização logística.", { exact: true }),
    ).toBeVisible();
    expect(
      await db.auditLog.count({
        where: { actorId: staff.id, entityId: target, action: "order.update" },
      }),
    ).toBe(1);
    await page
      .getByRole("combobox", { name: "Situação do pedido", exact: true })
      .selectOption("PAID");
    await page
      .getByRole("button", { name: "Filtrar pedidos", exact: true })
      .click();
    await expect(
      page.getByText("20 pedido(s) encontrado(s) · Página 1 de 1", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await anonymous.close();
    const ids = orders.map((o) => o.id);
    await db.auditLog.deleteMany({ where: { actorId: staff.id } });
    await db.mail.deleteMany({ where: { recipient: orders[0].email } });
    await db.orderEvent.deleteMany({ where: { orderId: { in: ids } } });
    await db.shipment.deleteMany({ where: { orderId: { in: ids } } });
    await db.order.deleteMany({ where: { id: { in: ids } } });
    await db.session.deleteMany({ where: { userId: staff.id } });
    await db.user.delete({ where: { id: staff.id } });
  }
});
