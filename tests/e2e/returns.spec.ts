import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
import { db } from "../../src/lib/db";
import { encrypt } from "../../src/lib/encryption";
import { hash } from "../../src/lib/security";
const origin = "http://localhost:3000";
test("cliente solicita devolução e equipe registra decisão pelo painel", async ({
  page,
  browser,
}) => {
  const password = "Return-Test-Password-123!",
    secret = "JBSWY3DPEHPK3PXP",
    access = randomUUID();
  const admin = await db.user.create({
    data: {
      email: `returns-${randomUUID()}@example.invalid`,
      name: "Admin devoluções",
      role: "ADMIN",
      verified: true,
      mfaEnabled: true,
      mfaSecret: encrypt(secret),
      passwordHash: await bcrypt.hash(password, 4),
    },
  });
  const order = await db.order.create({
    data: {
      accessHash: hash(access),
      idempotencyKey: randomUUID(),
      email: `return-order-${randomUUID()}@example.invalid`,
      name: "Cliente fictício",
      phone: "11999999999",
      address: {},
      status: "DELIVERED",
      subtotal: 10000,
      discount: 0,
      shipping: 0,
      total: 10000,
      shippingService: "TEST",
      expiresAt: new Date(),
    },
  });
  const guest = await browser.newContext({ baseURL: origin });
  try {
    const customer = await guest.newPage();
    await customer.goto(`/pedido/${order.id}?access=${access}`);
    await customer
      .getByLabel("Conte o que aconteceu")
      .fill("O tamanho não serviu, solicito devolução.");
    await customer
      .getByRole("button", { name: "Enviar solicitação", exact: true })
      .click();
    await expect(customer.getByText(/Solicitação:.*Em análise/)).toBeVisible();
    await expect(
      customer.getByRole("button", { name: "Enviar solicitação", exact: true }),
    ).toHaveCount(0);
    const value = await db.returnRequest.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const forbidden = await guest.request.patch(
      `/api/admin/returns/${value.id}`,
      {
        headers: { Origin: origin },
        data: {
          status: "approved",
          version: 0,
          note: "Tentativa não autorizada de decisão.",
        },
      },
    );
    expect(forbidden.status()).toBe(401);
    const code = new TOTP({
      secret: Secret.fromBase32(secret),
      digits: 6,
      period: 30,
    }).generate();
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: admin.email, password, code },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Devoluções", exact: true }).click();
    const card = page.getByRole("article", {
      name: `Solicitação do pedido ${order.id}`,
      exact: true,
    });
    await card
      .getByLabel("Observação para o cliente")
      .fill("Solicitação aprovada. Aguarde as instruções da equipe.");
    await card
      .getByRole("button", { name: "Aplicar decisão", exact: true })
      .click();
    await expect(card.getByText("Aprovada", { exact: true })).toBeVisible();
    await customer.reload();
    await expect(
      customer.getByText(/Observação da equipe: Solicitação aprovada/),
    ).toBeVisible();
    await card
      .getByLabel("Observação para o cliente")
      .fill("Produto recebido e encaminhado para conferência.");
    await card
      .getByRole("button", { name: "Aplicar decisão", exact: true })
      .click();
    await expect(
      card.getByText("Produto recebido", { exact: true }),
    ).toBeVisible();
    await db.returnRequest.update({
      where: { id: value.id },
      data: { refundState: "uncertain", version: { increment: 1 } },
    });
    await page.reload();
    await page.getByRole("button", { name: "Devoluções", exact: true }).click();
    await expect(
      card.getByRole("button", { name: "Consultar reembolso", exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Aplicar decisão", exact: true }),
    ).toHaveCount(0);
  } finally {
    await guest.close();
    const requests = await db.returnRequest.findMany({
      where: { orderId: order.id },
      select: { id: true },
    });
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: admin.id },
          { entityId: { in: requests.map((r) => r.id) } },
        ],
      },
    });
    await db.mail.deleteMany({ where: { recipient: order.email } });
    await db.returnRequest.deleteMany({ where: { orderId: order.id } });
    await db.orderEvent.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
    await db.session.deleteMany({ where: { userId: admin.id } });
    await db.user.delete({ where: { id: admin.id } });
  }
});
