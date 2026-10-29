import { it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { maintainTemporaryData } from "../src/lib/maintenance";
const prefix = "maintenance-test-" + randomUUID();
const old = new Date(Date.now() - 120 * 86400000);
const fresh = new Date();
afterAll(async () => {
  await db.cart.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.mail.deleteMany({
    where: { recipient: prefix + "@example.invalid" },
  });
  await db.rateLimit.deleteMany({ where: { key: { startsWith: prefix } } });
  await db.$disconnect();
});
it("recusa lotes inválidos antes de acessar o banco", async () => {
  for (const batchSize of [0, -1, 5001, 1.5, NaN])
    await expect(maintainTemporaryData({ batchSize })).rejects.toThrow("lote");
});
it("prévia preserva dados e execução remove apenas temporários vencidos", async () => {
  await db.cart.createMany({
    data: [
      { id: prefix + "-old", items: [], updatedAt: old },
      { id: prefix + "-fresh", items: [], updatedAt: fresh },
    ],
  });
  await db.mail.createMany({
    data: [
      {
        id: prefix + "-sent",
        recipient: prefix + "@example.invalid",
        subject: "test",
        body: "test",
        sentAt: old,
      },
      {
        id: prefix + "-pending",
        recipient: prefix + "@example.invalid",
        subject: "test",
        body: "test",
        createdAt: old,
        attempts: 5,
      },
    ],
  });
  await db.rateLimit.create({ data: { key: prefix, resetAt: old } });
  const business = await Promise.all([
    db.order.count(),
    db.payment.count(),
    db.subscriber.count(),
  ]);
  const preview = await maintainTemporaryData();
  expect(preview.mode).toBe("preview");
  expect(preview.results.every((r) => r.removed === 0)).toBe(true);
  expect(await db.cart.count({ where: { id: prefix + "-old" } })).toBe(1);
  const result = await maintainTemporaryData({ apply: true, batchSize: 5000 });
  expect(result.mode).toBe("apply");
  expect(await db.cart.count({ where: { id: prefix + "-old" } })).toBe(0);
  expect(await db.cart.count({ where: { id: prefix + "-fresh" } })).toBe(1);
  expect(await db.mail.count({ where: { id: prefix + "-sent" } })).toBe(0);
  expect(await db.mail.count({ where: { id: prefix + "-pending" } })).toBe(1);
  expect(await db.rateLimit.count({ where: { key: prefix } })).toBe(0);
  expect(
    await Promise.all([
      db.order.count(),
      db.payment.count(),
      db.subscriber.count(),
    ]),
  ).toEqual(business);
  expect(
    await db.auditLog.findFirst({
      where: { action: "temporary_data_cleanup" },
    }),
  ).toBeTruthy();
  const repeat = await maintainTemporaryData({ apply: true });
  expect(repeat.results.every((r) => r.removed === 0)).toBe(true);
});

it("respeita limite por tabela e não remove carrinho bloqueado por atualização", async () => {
  await db.cart.createMany({
    data: Array.from({ length: 3 }, (_, i) => ({
      id: prefix + "-batch-" + i,
      items: [],
      updatedAt: old,
    })),
  });
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${prefix + "-batch-0"} FOR UPDATE`;
    const result = await maintainTemporaryData({ apply: true, batchSize: 1 });
    expect(result.results.find((r) => r.table === "Cart")?.removed).toBe(1);
    expect(
      await tx.cart.findUnique({ where: { id: prefix + "-batch-0" } }),
    ).toBeTruthy();
    await tx.cart.update({
      where: { id: prefix + "-batch-0" },
      data: { updatedAt: fresh },
    });
  });
  await maintainTemporaryData({ apply: true });
  expect(
    await db.cart.count({ where: { id: { startsWith: prefix + "-batch-" } } }),
  ).toBe(1);
});

it("recusa segunda execução sem aguardar ou alterar registros", async () => {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(718325) AS locked`;
    await expect(maintainTemporaryData({ apply: true })).rejects.toThrow(
      "Outra manutenção",
    );
  });
});
