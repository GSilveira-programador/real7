import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
test("newsletter exige confirmação e oferece descadastro sem login", async ({
  page,
}) => {
  const email = "newsletter-e2e-" + randomUUID() + "@example.invalid";
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "Somente essenciais" }).click();
    const form = page.locator(".newsletter form");
    await form
      .getByRole("textbox", { name: "E-mail da newsletter" })
      .fill(email);
    await form.getByRole("checkbox").check();
    await form
      .getByRole("button", { name: "Inscrever-se", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("link de confirmação");
    const invitation = await db.mail.findFirstOrThrow({
      where: {
        recipient: email,
        subject: "Confirme sua inscrição — Elite Boots",
      },
    });
    const token = invitation.body.match(/\?confirm=([a-f0-9]{64})/)![1];
    const response = await page.goto("/newsletter?confirm=" + token);
    await expect(
      page.getByRole("heading", { name: "Confirme seu lugar no time." }),
    ).toBeVisible();
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
    ).toBe(false);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await page
      .getByRole("button", { name: "CONFIRMAR INSCRIÇÃO", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Inscrição confirmada",
    );
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
    ).toBe(true);
    await page.goto("/newsletter");
    await page.getByLabel("Seu e-mail", { exact: true }).fill(email);
    await page
      .getByRole("button", {
        name: "SOLICITAR LINK DE PREFERÊNCIAS",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "link de preferências",
    );
    const preferences = await db.mail.findFirstOrThrow({
      where: {
        recipient: email,
        subject: "Preferências de e-mail — Elite Boots",
      },
    });
    const exit = preferences.body.match(/\?unsubscribe=([a-f0-9]{64})/)![1];
    await page.goto("/newsletter?unsubscribe=" + exit);
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
    ).toBe(true);
    await page
      .getByRole("button", { name: "CONFIRMAR DESCADASTRO", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "descadastro foi aplicado",
    );
    expect(
      (await db.subscriber.findUniqueOrThrow({ where: { email } })).active,
    ).toBe(false);
  } finally {
    await db.subscriber.deleteMany({ where: { email } });
    await db.mail.deleteMany({ where: { recipient: email } });
    await db.auditLog.deleteMany({ where: { entityId: hash(email) } });
    await db.rateLimit.deleteMany({
      where: {
        key: {
          in: [
            "newsletter:" + hash(email),
            "newsletter-preferences:" + hash(email),
          ],
        },
      },
    });
  }
});
