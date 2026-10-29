import { beforeAll, beforeEach, afterEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { TOTP, Secret } from "otpauth";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { changeUserRole, recoverMfa } from "../src/lib/user-administration";
import { encrypt } from "../src/lib/encryption";
import { hash } from "../src/lib/security";
const secret = "JBSWY3DPEHPK3PXP",
  password = "Fixture-Test-Password-123!";
let actor: any, target: any;
const users: string[] = [];
const emails: string[] = [];
const code = () =>
  new TOTP({
    secret: Secret.fromBase32(secret),
    digits: 6,
    period: 30,
  }).generate();
async function create(
  role: "CUSTOMER" | "AGENT" | "MANAGER" | "ADMIN",
  mfaEnabled: boolean,
  verified = true,
) {
  const email = "role-test-" + randomUUID() + "@example.invalid";
  const u = await db.user.create({
    data: {
      email,
      name: "Fixture de permissões",
      passwordHash: await bcrypt.hash(password, 4),
      role,
      verified,
      mfaEnabled,
      mfaSecret: mfaEnabled ? encrypt(secret) : null,
    },
  });
  users.push(u.id);
  emails.push(email);
  return u;
}
beforeAll(async () => {
  process.env.MFA_ENCRYPTION_KEY = "de".repeat(32);
  const real = await db.user.count({
    where: { role: "ADMIN", mfaEnabled: true, deletedAt: null },
  });
  if (real)
    throw new Error(
      "Use um banco isolado para os testes administrativos: há administradores existentes. Nenhuma conta existente foi alterada.",
    );
});
beforeEach(async () => {
  actor = await create("ADMIN", true);
  target = await create("CUSTOMER", false);
});
afterEach(async () => {
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.mail.deleteMany({ where: { recipient: { in: emails } } });
  await db.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: users } }, { entityId: { in: users } }] },
  });
  await db.rateLimit.deleteMany({
    where: { key: { in: users.map((id) => "role-change:" + id) } },
  });
  await db.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
  emails.length = 0;
});
afterAll(() => db.$disconnect());
function input(role: "CUSTOMER" | "AGENT" | "MANAGER" | "ADMIN", version = 0) {
  return {
    role,
    version,
    reason: "Alteração solicitada para teste automatizado.",
    code: code(),
  };
}
it("altera perfil com MFA, registra motivo e revoga sessões do usuário", async () => {
  await db.session.create({
    data: {
      id: hash(randomUUID()),
      userId: target.id,
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  const result = await changeUserRole(actor.id, target.id, input("MANAGER"));
  expect(result.roleVersion).toBe(1);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: target.id } })).role,
  ).toBe("MANAGER");
  expect(await db.session.count({ where: { userId: target.id } })).toBe(0);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { entityId: target.id, action: "user.role.changed" },
  });
  expect(audit.details).toMatchObject({
    from: "CUSTOMER",
    to: "MANAGER",
    reason: "Alteração solicitada para teste automatizado.",
  });
  expect(JSON.stringify(audit.details)).not.toContain(code());
});
it("recusa código inválido e gerente tentando conceder permissões", async () => {
  await expect(
    changeUserRole(actor.id, target.id, {
      ...input("AGENT"),
      code: "not-a-code",
    }),
  ).rejects.toThrow();
  await expect(
    changeUserRole(actor.id, target.id, {
      ...input("AGENT"),
      code: code() === "000000" ? "111111" : "000000",
    }),
  ).rejects.toThrow(/MFA inválido/);
  await db.user.update({ where: { id: actor.id }, data: { role: "MANAGER" } });
  await expect(
    changeUserRole(actor.id, target.id, input("ADMIN")),
  ).rejects.toThrow(/Somente administrador/);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: target.id } })).role,
  ).toBe("CUSTOMER");
});
it("não promove conta sem e-mail verificado nem sobrescreve versão obsoleta", async () => {
  await db.user.update({ where: { id: target.id }, data: { verified: false } });
  await expect(
    changeUserRole(actor.id, target.id, input("AGENT")),
  ).rejects.toThrow(/verificado/);
  await db.user.update({ where: { id: target.id }, data: { verified: true } });
  await changeUserRole(actor.id, target.id, input("AGENT"));
  await expect(
    changeUserRole(actor.id, target.id, input("ADMIN")),
  ).rejects.toThrow(/outro operador/);
});
it("mantém o último administrador com MFA e permite transferência após preparar outro", async () => {
  await expect(
    changeUserRole(actor.id, actor.id, input("CUSTOMER")),
  ).rejects.toThrow(/último administrador/);
  await create("ADMIN", true);
  await changeUserRole(actor.id, actor.id, input("CUSTOMER"));
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: actor.id } })).role,
  ).toBe("CUSTOMER");
});
it("recuperação de MFA exige confirmação operacional e preserva a senha", async () => {
  const staff = await create("MANAGER", true);
  await db.session.create({
    data: {
      id: hash(randomUUID()),
      userId: staff.id,
      expiresAt: new Date(Date.now() + 86400000),
      mfaVerifiedAt: new Date(),
    },
  });
  await expect(
    recoverMfa({
      email: staff.email,
      reason: "Identidade verificada por canal independente.",
      confirm: "WRONG",
    }),
  ).rejects.toThrow();
  await recoverMfa({
    email: staff.email,
    reason: "Identidade verificada por canal independente.",
    confirm: "RESET-MFA",
    operator: "fixture-operator",
  });
  const recovered = await db.user.findUniqueOrThrow({
    where: { id: staff.id },
  });
  expect(recovered.mfaEnabled).toBe(false);
  expect(recovered.mfaSecret).toBe(null);
  expect(await bcrypt.compare(password, recovered.passwordHash)).toBe(true);
  expect(await db.session.count({ where: { userId: staff.id } })).toBe(0);
  expect(
    await db.auditLog.count({
      where: { entityId: staff.id, action: "user.mfa.recovered" },
    }),
  ).toBe(1);
  await expect(
    recoverMfa({
      email: staff.email,
      reason: "Identidade verificada por canal independente.",
      confirm: "RESET-MFA",
      operator: "fixture-operator",
    }),
  ).rejects.toThrow(/já está sem MFA/);
});

it("duas despromoções simultâneas não removem todos os administradores", async () => {
  const other = await create("ADMIN", true);
  const results = await Promise.allSettled([
    changeUserRole(actor.id, other.id, input("CUSTOMER")),
    changeUserRole(other.id, actor.id, input("CUSTOMER")),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.user.count({
      where: {
        id: { in: [actor.id, other.id] },
        role: "ADMIN",
        verified: true,
        mfaEnabled: true,
        deletedAt: null,
      },
    }),
  ).toBe(1);
});
