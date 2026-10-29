import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import bcrypt from "bcryptjs";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/security";
import { encrypt } from "../../src/lib/encryption";
const password = "Identity-Test-Password-123!",
  secret = "JBSWY3DPEHPK3PXP",
  origin = "http://localhost:3000";
const code = (key = secret) =>
  new TOTP({
    secret: Secret.fromBase32(key),
    digits: 6,
    period: 30,
  }).generate();
async function fixture(role: "ADMIN" | "CUSTOMER") {
  return db.user.create({
    data: {
      name: "Fixture " + randomUUID().slice(0, 8),
      email: "identity-" + randomUUID() + "@example.invalid",
      passwordHash: await bcrypt.hash(password, 4),
      verified: true,
      role,
      mfaEnabled: role === "ADMIN",
      mfaSecret: role === "ADMIN" ? encrypt(secret) : null,
    },
  });
}
async function remove(users: { id: string; email: string }[]) {
  const ids = users.map((u) => u.id);
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.authToken.deleteMany({ where: { userId: { in: ids } } });
  await db.mail.deleteMany({
    where: { recipient: { in: users.map((u) => u.email) } },
  });
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
test("alteração de perfil pela interface revoga sessões e exige MFA para a equipe", async ({
  page,
  browser,
}) => {
  const admin = await fixture("ADMIN"),
    customer = await fixture("CUSTOMER");
  const customerContext = await browser.newContext({ baseURL: origin });
  try {
    expect(
      (
        await customerContext.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: customer.email, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: admin.email, password, code: code() },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/admin");
    await page.getByRole("button", { name: "Clientes", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Alterar perfil de " + customer.name,
        exact: true,
      })
      .click();
    const form = page.locator(".permission-form");
    await form.getByLabel("Novo perfil").selectOption("MANAGER");
    await form.getByLabel("Seu código MFA").fill(code());
    await form
      .getByLabel("Motivo da alteração")
      .fill("Concessão temporária em teste automatizado.");
    await form
      .getByRole("button", { name: "Salvar permissões", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Alteração salva");
    expect(
      await (await customerContext.request.get("/api/auth/me")).json(),
    ).toBe(null);
    expect(
      (
        await customerContext.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: customer.email, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await customerContext.request.get("/api/admin/dashboard")).status(),
    ).toBe(403);
    const setup = await customerContext.request.post("/api/auth/mfa/setup", {
      headers: { Origin: origin },
      data: {},
    });
    expect(setup.status()).toBe(200);
    const mfa = await setup.json();
    expect(
      (
        await customerContext.request.post("/api/auth/mfa/enable", {
          headers: { Origin: origin },
          data: { code: code(mfa.secret) },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await customerContext.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: customer.email, password, code: code(mfa.secret) },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await customerContext.request.get("/api/admin/dashboard")).status(),
    ).toBe(200);
    const denied = await customerContext.request.patch(
      "/api/admin/users/" + admin.id + "/role",
      {
        headers: { Origin: origin },
        data: {
          role: "CUSTOMER",
          version: 0,
          reason: "Tentativa sem autorização administrativa.",
          code: code(mfa.secret),
        },
      },
    );
    expect(denied.status()).toBe(403);
  } finally {
    await customerContext.close();
    await remove([admin, customer]);
  }
});
test("sessão antiga sem prova MFA não recebe privilégios administrativos", async ({
  context,
  page,
}) => {
  const admin = await fixture("ADMIN"),
    raw = randomBytes(32).toString("hex");
  try {
    await db.session.create({
      data: {
        id: hash(raw),
        userId: admin.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await context.addCookies([
      {
        name: "elite_session",
        value: raw,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
    expect((await page.request.get("/api/admin/dashboard")).status()).toBe(403);
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: admin.email, password, code: code() },
        })
      ).status(),
    ).toBe(200);
    expect((await page.request.get("/api/admin/dashboard")).status()).toBe(200);
    const session = await db.session.findFirstOrThrow({
      where: { userId: admin.id, mfaVerifiedAt: { not: null } },
    });
    expect(session.mfaVerifiedAt).not.toBe(null);
  } finally {
    await remove([admin]);
  }
});
test("exclusão de conta revoga recuperação e bloqueia novas sessões do cadastro anonimizado", async ({
  context,
  page,
}) => {
  const customer = await fixture("CUSTOMER"),
    reset = hash(randomUUID());
  let orderId: string | undefined;
  try {
    await db.authToken.create({
      data: {
        id: hash(reset),
        userId: customer.id,
        kind: "reset",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await db.subscriber.create({
      data: { email: customer.email, active: true, confirmedAt: new Date() },
    });
    const order = await db.order.create({
      data: {
        accessHash: hash(randomUUID()),
        idempotencyKey: randomUUID(),
        userId: customer.id,
        email: customer.email,
        name: customer.name,
        phone: "11999999999",
        address: {},
        subtotal: 10000,
        discount: 0,
        shipping: 0,
        total: 10000,
        shippingService: "TEST",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    orderId = order.id;
    expect(
      (
        await page.request.post("/api/auth/login", {
          headers: { Origin: origin },
          data: { email: customer.email, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.delete("/api/account", {
          headers: { Origin: origin },
          data: { password },
        })
      ).status(),
    ).toBe(200);
    const deleted = await db.user.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(deleted.deletedAt).not.toBe(null);
    expect(deleted.verified).toBe(false);
    expect(await db.authToken.count({ where: { userId: customer.id } })).toBe(
      0,
    );
    expect(
      await db.subscriber.findUnique({ where: { email: customer.email } }),
    ).toBe(null);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).userId,
    ).toBe(customer.id);
    const fake = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        id: hash(fake),
        userId: customer.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await context.addCookies([
      {
        name: "elite_session",
        value: fake,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
        secure: false,
      },
    ]);
    expect(await (await page.request.get("/api/auth/me")).json()).toBe(null);
    expect(
      (
        await page.request.post("/api/auth/reset", {
          headers: { Origin: origin },
          data: { token: reset, password: "Another-Test-Password-123!" },
        })
      ).status(),
    ).toBe(400);
    const lateReset = randomBytes(32).toString("hex");
    await db.authToken.create({
      data: {
        id: hash(lateReset),
        userId: customer.id,
        kind: "reset",
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const late = await page.request.post("/api/auth/reset", {
      headers: { Origin: origin },
      data: { token: lateReset, password: "Another-Test-Password-123!" },
    });
    expect(late.status()).toBe(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: customer.id } }))
        .passwordHash,
    ).toBe(deleted.passwordHash);
  } finally {
    if (orderId) await db.order.delete({ where: { id: orderId } });
    await db.subscriber.deleteMany({ where: { email: customer.email } });
    await remove([customer]);
  }
});
