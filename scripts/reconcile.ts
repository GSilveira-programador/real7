import "dotenv/config";
import { db } from "../src/lib/db";
import { mp, syncPayment } from "../src/lib/payments";
import { releaseOrder } from "../src/lib/commerce";
async function main() {
  const orders = await db.order.findMany({
    where: { status: "PENDING" },
    include: { payment: true },
  });
  for (const o of orders) {
    try {
      const result = await mp(
        "/v1/payments/search?external_reference=" + encodeURIComponent(o.id),
      );
      for (const p of result.results || []) await syncPayment(String(p.id));
      const fresh = await db.order.findUniqueOrThrow({ where: { id: o.id } });
      // Never release a live payment reservation. Expired preferences must be checked by an operator.
      if (fresh.status === "PENDING" && fresh.expiresAt < new Date())
        console.warn(
          "review_expired_reservation",
          o.id,
          "Confirm preference expiration/cancellation with provider before stock release.",
        );
    } catch {
      console.error("reconciliation_failed", o.id);
      process.exitCode = 1;
    }
  }
}
main().finally(() => db.$disconnect());
