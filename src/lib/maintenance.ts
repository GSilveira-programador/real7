import { Prisma } from "@prisma/client";
import { db } from "./db";

// Only temporary records. Business records and unconfirmed/failed mail are excluded.
const policies = [
  { table: "Session", column: "expiresAt", days: 1 },
  { table: "AuthToken", column: "expiresAt", days: 1 },
  { table: "RateLimit", column: "resetAt", days: 1 },
  { table: "Cart", column: "updatedAt", days: 90 },
  { table: "Mail", column: "sentAt", days: 30 },
] as const;
export type MaintenanceOptions = { apply?: boolean; batchSize?: number };

export async function maintainTemporaryData(options: MaintenanceOptions = {}) {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000)
    throw new Error("O lote deve ser um inteiro entre 1 e 5000.");
  return db.$transaction(
    async (tx) => {
      // Fixed transaction clock and a single worker; bounded work per invocation.
      const lock = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(718325) AS locked`;
      if (!lock[0].locked)
        throw new Error("Outra manutenção está em execução.");
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT CURRENT_TIMESTAMP AS now`;
      const results = [];
      for (const policy of policies) {
        // Identifiers come exclusively from the closed, internal list above.
        const table = Prisma.raw(`"${policy.table}"`);
        const identity = Prisma.raw(
          policy.table === "RateLimit" ? '"key"' : '"id"',
        );
        const column = Prisma.raw(`"${policy.column}"`);
        const cutoff = new Date(now.getTime() - policy.days * 86400000);
        const eligible = await tx.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        SELECT count(*) AS count FROM ${table} WHERE ${column} < ${cutoff}`);
        let removed = 0;
        if (options.apply) {
          // Lock rows before removing them, rechecking eligibility against concurrent writes.
          // Active carts updated by checkout are skipped instead of blocking customer actions.
          removed = await tx.$executeRaw(Prisma.sql`
          WITH candidates AS MATERIALIZED (
            SELECT ${identity} FROM ${table} WHERE ${column} < ${cutoff}
            ORDER BY ${column}, ${identity} LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
          )
          DELETE FROM ${table} WHERE ${identity} IN (SELECT ${identity} FROM candidates)
          AND ${column} < ${cutoff}`);
        }
        results.push({
          table: policy.table,
          cutoff: cutoff.toISOString(),
          eligible: Number(eligible[0].count),
          removed,
        });
      }
      if (options.apply)
        await tx.auditLog.create({
          data: {
            actorId: "SYSTEM:maintenance",
            action: "temporary_data_cleanup",
            entityId: "maintenance",
            details: { batchSize, results },
          },
        });
      return {
        mode: options.apply ? "apply" : "preview",
        at: now.toISOString(),
        batchSize,
        results,
      };
    },
    { timeout: 30000 },
  );
}
