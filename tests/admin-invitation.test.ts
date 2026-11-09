import { it, expect, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import {
  createAdminInvitation,
  acceptAdminInvitation,
} from "../src/lib/admin-invitation";
import { hash } from "../src/lib/security";
const prefix = "bootstrap-test-" + randomUUID(),
  password = "Senha-Demonstrativa-123!";
const email = prefix + "@example.invalid";
async function cleanup() {
  const users = await db.user.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  const invites = await db.adminInvitation.findMany({
    where: { email: { startsWith: prefix } },
    select: { id: true },
  });
  await db.auditLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: users.map((u) => u.id) } },
        { entityId: { in: invites.map((i) => i.id) } },
      ],
    },
  });
  await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await db.adminInvitation.deleteMany({
    where: { email: { startsWith: prefix } },
  });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});
it("convite usa hash, é vinculado ao e-mail e não armazena a senha", async () => {
  const token = await createAdminInvitation(email);
  const invite = await db.adminInvitation.findUniqueOrThrow({
    where: { tokenHash: hash(token) },
  });
  expect(invite.tokenHash).not.toBe(token);
  await expect(
    acceptAdminInvitation({
      token,
      email: "outro@example.invalid",
      password,
      name: "Administrador teste",
    }),
  ).rejects.toThrow("inválido");
  await acceptAdminInvitation({
    token,
    email,
    password,
    name: "Administrador teste",
  });
  const admin = await db.user.findUniqueOrThrow({ where: { email } });
  expect(admin.role).toBe("ADMIN");
  expect(admin.mfaEnabled).toBe(false);
  expect(admin.passwordHash).not.toBe(password);
  expect(await bcrypt.compare(password, admin.passwordHash)).toBe(true);
  expect(
    (await db.adminInvitation.findUniqueOrThrow({ where: { id: invite.id } }))
      .usedAt,
  ).not.toBeNull();
});
it("aceitação simultânea cria uma única conta e consome o convite uma vez", async () => {
  const token = await createAdminInvitation(email);
  const result = await Promise.allSettled([
    acceptAdminInvitation({ token, email, password, name: "Admin teste" }),
    acceptAdminInvitation({ token, email, password, name: "Admin teste" }),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.user.count({ where: { email } })).toBe(1);
});
it("novo convite invalida o anterior e convites expirados não criam conta", async () => {
  const old = await createAdminInvitation(email),
    latest = await createAdminInvitation(email);
  await expect(
    acceptAdminInvitation({ token: old, email, password, name: "Admin teste" }),
  ).rejects.toThrow("inválido");
  await db.adminInvitation.update({
    where: { tokenHash: hash(latest) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(
    acceptAdminInvitation({
      token: latest,
      email,
      password,
      name: "Admin teste",
    }),
  ).rejects.toThrow("inválido");
  expect(await db.user.count({ where: { email } })).toBe(0);
});
it("não promove conta existente nem substitui administrador existente", async () => {
  await db.user.create({
    data: {
      email,
      name: "Cliente teste",
      passwordHash: "fixture",
      role: "CUSTOMER",
    },
  });
  await expect(createAdminInvitation(email)).rejects.toThrow("cadastrado");
  expect((await db.user.findUniqueOrThrow({ where: { email } })).role).toBe(
    "CUSTOMER",
  );
  await db.user.update({ where: { email }, data: { role: "ADMIN" } });
  await expect(
    createAdminInvitation(prefix + "-other@example.invalid"),
  ).rejects.toThrow("existe administrador");
});
