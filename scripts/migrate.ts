import "dotenv/config";
import { Client } from "pg";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
// Apply reviewed SQL migrations without a native Prisma CLI engine.
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(718325)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS _elite_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    for (const name of (
      await readdir("prisma/migrations", { withFileTypes: true })
    )
      .filter((v) => v.isDirectory())
      .map((v) => v.name)
      .sort()) {
      const sql = await readFile(
        path.join("prisma/migrations", name, "migration.sql"),
        "utf8",
      );
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM _elite_migrations WHERE name=$1",
        [name],
      );
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error("Migration já aplicada foi alterada: " + name);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO _elite_migrations(name,checksum) VALUES ($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        console.log("Migration aplicada:", name);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(718325)");
    await client.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
