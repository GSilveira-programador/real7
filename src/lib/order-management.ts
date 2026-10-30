import { Prisma, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
import { reportRange } from "./reports";
const filters = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(OrderStatus).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export async function listOrders(raw: unknown) {
  const input = filters.parse(raw);
  const where: Prisma.OrderWhereInput = {};
  if (input.status) where.status = input.status;
  if (input.q)
    where.OR = [
      { id: { endsWith: input.q, mode: "insensitive" } },
      { name: { contains: input.q, mode: "insensitive" } },
      { email: { contains: input.q, mode: "insensitive" } },
      {
        shipment: { trackingCode: { contains: input.q, mode: "insensitive" } },
      },
    ];
  if (input.from || input.to) {
    const { from, to } = reportRange.parse({ from: input.from, to: input.to });
    const [range] = await db.$queryRaw<
      { start: Date; end: Date }[]
    >`SELECT (${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AS start, ((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS end`;
    where.createdAt = { gte: range.start, lt: range.end };
  }
  return db.$transaction(
    async (tx) => {
      const total = await tx.order.count({ where });
      const pages = Math.max(1, Math.ceil(total / input.pageSize));
      const page = Math.min(input.page, pages);
      const orders = await tx.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          total: true,
          createdAt: true,
          payment: { select: { status: true } },
          shipment: { select: { trackingCode: true } },
        },
      });
      return { orders, total, page, pages, pageSize: input.pageSize };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
export async function orderDetail(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      status: true,
      total: true,
      subtotal: true,
      discount: true,
      shipping: true,
      shippingService: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          name: true,
          size: true,
          quantity: true,
          price: true,
          variant: { select: { sku: true } },
        },
      },
      payment: { select: { status: true, creationState: true } },
      shipment: true,
      events: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, status: true, note: true, createdAt: true },
      },
    },
  });
  if (!order) throw new HttpError(404, "Pedido não encontrado.");
  return order;
}
