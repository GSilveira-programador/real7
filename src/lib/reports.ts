import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inválida.");
export const reportRange = z.object({ from: day, to: day }).refine((v) => {
  const diff = new Date(v.to).getTime() - new Date(v.from).getTime();
  return diff >= 0 && diff <= 365 * 86400000;
}, "Escolha um período de até 366 dias, com início anterior ao fim.");
const paid = Prisma.sql`('PAID','PREPARING','SHIPPED','IN_TRANSIT','DELIVERED')`;
function integer(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isSafeInteger(n))
    throw new Error("Agregado fora do intervalo seguro.");
  return n;
}
export async function salesReport(input: unknown) {
  const { from, to } = reportRange.parse(input);
  const timezone = "America/Sao_Paulo";
  const range = Prisma.sql`o."createdAt">=(${from}::date::timestamp AT TIME ZONE ${timezone}) AND o."createdAt"<((${to}::date+1)::timestamp AT TIME ZONE ${timezone})`;
  return db.$transaction(
    async (tx) => {
      const status = await tx.$queryRaw<
        { status: string; count: string; total: string }[]
      >(
        Prisma.sql`SELECT o.status::text AS status,COUNT(*)::text AS count,COALESCE(SUM(o.total),0)::text AS total FROM "Order" o WHERE ${range} GROUP BY o.status`,
      );
      const days = await tx.$queryRaw<
        { day: string; orders: string; revenue: string }[]
      >(
        Prisma.sql`SELECT to_char(timezone(${timezone},o."createdAt"),'YYYY-MM-DD') AS day,COUNT(*)::text AS orders,COALESCE(SUM(CASE WHEN o.status IN ${paid} THEN o.total ELSE 0 END),0)::text AS revenue FROM "Order" o WHERE ${range} GROUP BY day ORDER BY day`,
      );
      const top = await tx.$queryRaw<
        { id: string; name: string; units: string; revenue: string }[]
      >(
        Prisma.sql`SELECT p.id,p.name,SUM(i.quantity)::text AS units,SUM(i.quantity::bigint*i.price)::text AS revenue FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id JOIN "Variant" v ON v.id=i."variantId" JOIN "Product" p ON p.id=v."productId" WHERE ${range} AND o.status IN ${paid} GROUP BY p.id,p.name ORDER BY SUM(i.quantity) DESC,p.name LIMIT 10`,
      );
      const eligible = new Set([
        "PAID",
        "PREPARING",
        "SHIPPED",
        "IN_TRANSIT",
        "DELIVERED",
      ]);
      const states = status.map((v) => ({
        status: v.status,
        count: integer(v.count),
        total: integer(v.total),
      }));
      const paidOrders = states
        .filter((v) => eligible.has(v.status))
        .reduce((n, v) => n + v.count, 0);
      const revenue = states
        .filter((v) => eligible.has(v.status))
        .reduce((n, v) => n + v.total, 0);
      const daily = [];
      const map = new Map(days.map((v) => [v.day, v]));
      for (
        let d = new Date(from + "T12:00:00Z");
        d <= new Date(to + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + 1)
      ) {
        const day = d.toISOString().slice(0, 10),
          row = map.get(day);
        daily.push({
          day,
          orders: integer(row?.orders),
          revenue: integer(row?.revenue),
        });
      }
      return {
        from,
        to,
        timezone,
        orders: states.reduce((n, v) => n + v.count, 0),
        paidOrders,
        revenue,
        averageTicket: paidOrders ? Math.round(revenue / paidOrders) : 0,
        pendingOrders: states.find((v) => v.status === "PENDING")?.count || 0,
        statuses: states,
        daily,
        topProducts: top.map((v) => ({
          ...v,
          units: integer(v.units),
          revenue: integer(v.revenue),
        })),
        conversion: null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
