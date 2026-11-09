import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { db } from "../../src/lib/db";
import { createAdminInvitation } from "../../src/lib/admin-invitation";
const origin = "http://localhost:3000";
test("convite inicial cria conta pelo navegador, exige MFA e libera o painel", async ({
  page,
}) => {
  const email = `bootstrap-e2e-${randomUUID()}@example.invalid`,
    password = "Bootstrap-Test-Password-123!";
  const token = await createAdminInvitation(email);
  try {
    await page.goto("/admin/ativar#token=" + token);
    await page
      .getByLabel("Seu nome", { exact: true })
      .fill("Administrador fictício");
    await expect(page).toHaveURL(origin + "/admin/ativar");
    await page.getByLabel("E-mail do convite", { exact: true }).fill(email);
    await page.getByLabel("Escolha sua senha", { exact: true }).fill(password);
    await page.getByLabel("Repita a senha", { exact: true }).fill(password);
    await page
      .getByLabel("Mostrar senha enquanto digito", { exact: true })
      .check();
    await expect(
      page.getByLabel("Escolha sua senha", { exact: true }),
    ).toHaveAttribute("type", "text");
    await page
      .getByRole("button", { name: "Criar meu acesso", exact: true })
      .click();
    await expect(
      page.getByRole("link", {
        name: "Entrar e configurar autenticador",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    expect((await page.request.get("/api/admin/dashboard")).status()).toBe(403);
    await page.goto("/conta");
    const consent = page.getByRole("button", {
      name: "Somente essenciais",
      exact: true,
    });
    if (await consent.isVisible()) await consent.click();
    await page
      .getByRole("button", { name: "Configurar autenticador", exact: true })
      .click();
    const key = await page.locator(".mfa-key").innerText();
    const code = () =>
      new TOTP({
        secret: Secret.fromBase32(key),
        digits: 6,
        period: 30,
      }).generate();
    await page.getByLabel("Código de 6 dígitos", { exact: true }).fill(code());
    await page.getByRole("button", { name: "Ativar MFA", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.user.findUniqueOrThrow({ where: { email } })).mfaEnabled,
      )
      .toBe(true);
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email, password, code: code() },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Controle do jogo.", exact: true }),
    ).toBeVisible();
  } finally {
    const user = await db.user.findUnique({ where: { email } });
    const invites = await db.adminInvitation.findMany({
      where: { email },
      select: { id: true },
    });
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: invites.map((v) => v.id) } },
          ...(user ? [{ actorId: user.id }] : []),
        ],
      },
    });
    if (user) {
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
    await db.adminInvitation.deleteMany({ where: { email } });
  }
});
