import { beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("next/headers", () => ({ cookies: async () => ({ set: vi.fn() }) }));
import { db } from "../src/lib/db";
import { session } from "../src/lib/security";
let user: any;
beforeEach(async () => {
  user = await db.user.create({
    data: {
      email: "session-fixture-" + randomUUID() + "@example.invalid",
      name: "Fixture de autenticação",
      passwordHash: "fixture-password-before-validation",
      verified: true,
    },
  });
});
afterEach(async () => {
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
});
afterAll(() => db.$disconnect());
it("login em andamento não emite sessão com senha que já foi substituída", async () => {
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: "fixture-password-after-reset" },
  });
  await expect(session(user.id, false, user)).rejects.toThrow(
    /dados de acesso/,
  );
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
});
it("snapshot anterior à alteração de MFA, perfil ou exclusão é recusado", async () => {
  await db.user.update({
    where: { id: user.id },
    data: { mfaSecret: "fixture-new-secret", mfaEnabled: true },
  });
  await expect(session(user.id, false, user)).rejects.toThrow();
  await db.user.update({
    where: { id: user.id },
    data: { mfaSecret: null, mfaEnabled: false, roleVersion: 1 },
  });
  await expect(session(user.id, false, user)).rejects.toThrow();
  await db.user.update({
    where: { id: user.id },
    data: { roleVersion: 0, deletedAt: new Date() },
  });
  await expect(session(user.id, false, user)).rejects.toThrow();
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
});
it("reset concorrente revoga também uma sessão que estava sendo criada", async () => {
  await Promise.allSettled([
    session(user.id, false, user),
    db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: "fixture-reset-concurrently" },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
    }),
  ]);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash,
  ).toBe("fixture-reset-concurrently");
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
});
