import type { Prisma } from "@prisma/client";
import { Client } from "pg";
import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
import { encrypt } from "../../src/lib/encryption";
const origin = "http://localhost:3000";
test("configuração comercial salva redes e atendimento sem habilitar vendas", async ({
  page,
  context,
  browser,
}) => {
  const lock = new Client({ connectionString: process.env.DATABASE_URL });
  await lock.connect();
  await lock.query("SELECT pg_advisory_lock(718328)");
  try {
    const original = await db.setting.findUniqueOrThrow({
      where: { key: "store" },
    });
    const raw = randomUUID();
    const admin = await db.user.create({
      data: {
        email: `settings-${randomUUID()}@example.invalid`,
        name: "Admin comercial fictício",
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
    const guest = await browser.newContext({ baseURL: origin });
    try {
      expect(
        (await guest.request.get("/api/admin/settings/readiness")).status(),
      ).toBe(401);
      const ready = await page.request.get("/api/admin/settings/readiness");
      expect(ready.status()).toBe(200);
      expect(await ready.json()).toHaveProperty("checks");
      await page.goto("/admin");
      const consent = page.getByRole("button", {
        name: "Somente essenciais",
        exact: true,
      });
      if (await consent.isVisible()) await consent.click();
      await page
        .getByRole("button", { name: "Configurações", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "Preparação para vendas",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByLabel("Horário de atendimento", { exact: true })
        .fill("Horário fictício para teste automatizado.");
      await page
        .getByLabel("Perfil no Instagram", { exact: true })
        .fill("https://www.instagram.com/jn.exemplo/");
      await page
        .getByRole("button", { name: "Salvar configurações", exact: true })
        .click();
      await expect(page.locator(".toast")).toContainText("Alteração salva");
      const updated = await db.setting.findUniqueOrThrow({
        where: { key: "store" },
      });
      expect(updated.version).toBe(original.version + 1);
      expect((updated.value as any).salesEnabled).toBe(false);
      const stale = await page.request.put("/api/admin/settings", {
        headers: { Origin: origin },
        data: { ...(updated.value as any), version: original.version },
      });
      expect(stale.status()).toBe(409);
      const contact = await guest.newPage();
      await contact.goto("/contato");
      await expect(
        contact.getByText("Horário fictício para teste automatizado.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        contact.getByRole("link", { name: "Instagram ↗", exact: true }),
      ).toHaveAttribute("href", "https://www.instagram.com/jn.exemplo/");
      await expect(
        contact.getByText("AMBIENTE DEMONSTRATIVO · VENDAS DESATIVADAS", {
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      await guest.close();
      await db.setting.update({
        where: { key: "store" },
        data: {
          value: original.value as Prisma.InputJsonValue,
          version: original.version,
        },
      });
      await db.auditLog.deleteMany({ where: { actorId: admin.id } });
      await db.session.deleteMany({ where: { userId: admin.id } });
      await db.user.delete({ where: { id: admin.id } });
    }
  } finally {
    await lock.end();
  }
});
