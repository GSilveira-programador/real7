import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./security";
import { mp } from "./payments";
import type { Prisma } from "@prisma/client";

const decision = z.object({
  status: z.enum(["approved", "rejected", "received", "refunded"]),
  version: z.number().int().min(0),
  note: z.string().trim().min(10).max(1000),
});
export async function requestReturn(orderId: string, raw: unknown) {
  const { reason } = z
    .object({ reason: z.string().trim().min(10).max(2000) })
    .parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (
      !["PAID", "PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(
        order.status,
      )
    )
      throw new HttpError(409, "Pedido não elegível.");
    if (
      await tx.returnRequest.findFirst({
        where: { orderId, status: { not: "rejected" } },
      })
    )
      throw new HttpError(409, "Já existe uma solicitação para este pedido.");
    const value = await tx.returnRequest.create({ data: { orderId, reason } });
    await tx.mail.create({
      data: {
        recipient: order.email,
        subject: "Solicitação recebida — JN Chuteiras",
        body: `Pedido ${orderId}: sua solicitação foi registrada para análise. Acompanhe pela página do pedido.`,
      },
    });
    return value;
  });
}
async function lockReturn(tx: Prisma.TransactionClient, id: string) {
  const request = await tx.returnRequest.findUniqueOrThrow({
    where: { id },
    select: { orderId: true },
  });
  // Same lock order as payment notifications, return creation and stock release.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${request.orderId} FOR UPDATE`;
  return tx.returnRequest.findUniqueOrThrow({
    where: { id },
    include: { order: { include: { payment: true } } },
  });
}
export async function decideReturn(id: string, raw: unknown, actorId: string) {
  const input = decision.parse(raw);
  const value = await db.$transaction(async (tx) => {
    const r = await lockReturn(tx, id);
    const allowed: Record<string, string[]> = {
      requested: ["approved", "rejected"],
      approved: ["received"],
      received: ["refunded"],
    };
    if (
      r.version !== input.version ||
      !allowed[r.status]?.includes(input.status)
    )
      throw new HttpError(
        409,
        "Solicitação alterada ou transição inválida. Recarregue o painel.",
      );
    if (input.status === "refunded") {
      if (r.refundState !== "new")
        throw new HttpError(
          409,
          "Reembolso já iniciado. Consulte o provedor antes de qualquer nova tentativa.",
        );
      if (!r.order.payment?.providerId || r.order.payment.status !== "approved")
        throw new HttpError(409, "Pagamento aprovado ainda não conciliado.");
    }
    const updated = await tx.returnRequest.update({
      where: { id },
      data: {
        ...(input.status === "refunded"
          ? { refundState: "processing" }
          : { status: input.status }),
        decisionNote: input.note,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entityId: id,
        action:
          input.status === "refunded"
            ? "return.refund_started"
            : "return." + input.status,
        details: { note: input.note, version: input.version },
      },
    });
    if (input.status !== "refunded")
      await tx.mail.create({
        data: {
          recipient: r.order.email,
          subject: "Atualização da solicitação — JN Chuteiras",
          body: `Pedido ${r.orderId}: ${input.status === "approved" ? "solicitação aprovada para continuidade do atendimento" : input.status === "rejected" ? "solicitação não aprovada" : "recebimento do produto confirmado"}. Observação da equipe: ${input.note}`,
        },
      });
    return { ...r, ...updated };
  });
  if (input.status !== "refunded") return { ok: true };
  try {
    const refund = await mp(
      `/v1/payments/${encodeURIComponent(value.order.payment!.providerId!)}/refunds`,
      { amount: value.order.total / 100 },
      "refund-order-" + value.orderId,
    );
    if (
      refund.status !== "approved" ||
      !refund.id ||
      String(refund.payment_id) !== value.order.payment!.providerId ||
      Math.round(Number(refund.amount) * 100) !== value.order.total
    )
      throw new Error("Unconfirmed refund");
    await confirmRefund(id, String(refund.id), actorId);
    return { ok: true };
  } catch {
    await db.$transaction(async (tx) => {
      const changed = await tx.returnRequest.updateMany({
        where: { id, refundState: "processing" },
        data: { refundState: "uncertain", version: { increment: 1 } },
      });
      if (changed.count)
        await tx.auditLog.create({
          data: { actorId, action: "return.refund_uncertain", entityId: id },
        });
    });
    return {
      ok: false,
      pending: true,
      message:
        "Resposta de reembolso não confirmada. Não repita a operação; utilize Consultar reembolso.",
    };
  }
}
async function confirmRefund(id: string, refundId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const r = await lockReturn(tx, id);
    if (r.refundState === "confirmed") return { ok: true };
    if (!["processing", "uncertain"].includes(r.refundState))
      throw new HttpError(409, "Reembolso não iniciado.");
    await tx.returnRequest.update({
      where: { id },
      data: {
        status: "refunded",
        refundState: "confirmed",
        refundId,
        version: { increment: 1 },
      },
    });
    await tx.order.update({
      where: { id: r.orderId },
      data: { status: "REFUNDING" },
    });
    await tx.orderEvent.create({
      data: {
        orderId: r.orderId,
        status: "REFUNDING",
        note: "Reembolso integral confirmado pela API. Estoque físico exige conferência separada.",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "return.refund_confirmed",
        entityId: id,
        details: { refundId },
      },
    });
    await tx.mail.create({
      data: {
        recipient: r.order.email,
        subject: "Reembolso confirmado",
        body: `Pedido ${r.orderId}: o provedor confirmou o reembolso integral. O prazo de crédito depende da instituição financeira.`,
      },
    });
    return { ok: true };
  });
}
export async function reconcileReturnRefund(id: string, actorId: string) {
  const r = await db.returnRequest.findUniqueOrThrow({
    where: { id },
    include: { order: { include: { payment: true } } },
  });
  if (r.refundState === "confirmed") return { ok: true };
  if (
    !["processing", "uncertain"].includes(r.refundState) ||
    !r.order.payment?.providerId
  )
    throw new HttpError(409, "Não há reembolso pendente de consulta.");
  const refunds = await mp(
    `/v1/payments/${encodeURIComponent(r.order.payment.providerId)}/refunds`,
  );
  if (!Array.isArray(refunds))
    throw new HttpError(502, "Resposta de consulta inválida.");
  const confirmed = refunds.find(
    (v: any) =>
      v.status === "approved" &&
      v.id &&
      String(v.payment_id) === r.order.payment!.providerId &&
      Math.round(Number(v.amount) * 100) === r.order.total,
  );
  if (!confirmed)
    return {
      ok: false,
      pending: true,
      message:
        "Reembolso integral ainda não confirmado. Nenhuma nova operação foi enviada.",
    };
  return confirmRefund(id, String(confirmed.id), actorId);
}
