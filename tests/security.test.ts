import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { equal, limit, HttpError } from "../src/lib/security";
const key = "rate-test-" + randomUUID();
afterAll(async () => {
  await db.rateLimit.deleteMany({ where: { key } });
  await db.$disconnect();
});
it("comparação segura rejeita conteúdo Unicode sem lançar erro de tamanhos", () => {
  expect(equal("abc", "abc")).toBe(true);
  expect(equal("a", "á")).toBe(false);
  expect(equal("", "á")).toBe(false);
  expect(equal("á", "á")).toBe(true);
});
it("renova janela expirada atomicamente sem perder contagem sob concorrência", async () => {
  await db.rateLimit.create({
    data: { key, count: 999, resetAt: new Date(Date.now() - 60000) },
  });
  const attempts = await Promise.allSettled(
    Array.from({ length: 20 }, () => limit(key, 5)),
  );
  expect(attempts.filter((v) => v.status === "fulfilled")).toHaveLength(5);
  expect(
    attempts.filter(
      (v) =>
        v.status === "rejected" &&
        v.reason instanceof HttpError &&
        v.reason.status === 429,
    ),
  ).toHaveLength(15);
  expect((await db.rateLimit.findUniqueOrThrow({ where: { key } })).count).toBe(
    20,
  );
});
