import { externalFetch } from "./external";
import { createHmac } from "node:crypto";
import { db } from "./db";
import { equal, HttpError } from "./security";
export async function mp(path: string, body?: unknown, key?: string) {
  if (!process.env.MP_ACCESS_TOKEN)
    throw new HttpError(503, "Pagamentos não configurados.");
  const r = await externalFetch("https://api.mercadopago.com" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(key ? { "X-Idempotency-Key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new HttpError(
      502,
      "Falha no provedor. Consulte seu pedido antes de tentar novamente.",
    );
  return r.json() as Promise<any>;
}
export function verifyWebhook(req: Request, id: string) {
  if (!process.env.MP_WEBHOOK_SECRET)
    throw new HttpError(503, "Webhook não configurado.");
  const f = Object.fromEntries(
    (req.headers.get("x-signature") || "")
      .split(",")
      .map((s) => s.trim().split("=")),
  );
  const rid = req.headers.get("x-request-id");
  const ts = Number(f.ts);
  const ms = ts < 1e12 ? ts * 1000 : ts;
  if (
    !rid ||
    !f.ts ||
    !f.v1 ||
    !Number.isFinite(ms) ||
    Math.abs(Date.now() - ms) > 300000
  )
    throw new HttpError(401, "Assinatura ausente ou expirada.");
  const expected = createHmac("sha256", process.env.MP_WEBHOOK_SECRET)
    .update(`id:${id.toLowerCase()};request-id:${rid};ts:${f.ts};`)
    .digest("hex");
  if (!equal(expected, f.v1)) throw new HttpError(401, "Assinatura inválida.");
}
export async function syncPayment(id: string) {
  const p = await mp("/v1/payments/" + encodeURIComponent(id));
  const o = await db.order.findUnique({
    where: { id: String(p.external_reference) },
    include: { payment: true },
  });
  if (!o?.payment) throw new HttpError(404, "Pedido não encontrado.");
  if (
    process.env.MP_COLLECTOR_ID &&
    String(p.collector_id) !== process.env.MP_COLLECTOR_ID
  )
    throw new HttpError(409, "Recebedor divergente.");
  if (
    p.currency_id !== "BRL" ||
    Math.round(Number(p.transaction_amount) * 100) !== o.total
  )
    throw new HttpError(409, "Valor ou moeda divergente.");
  const updatedAt = new Date(p.date_last_updated);
  const knownStatuses = [
    "pending",
    "in_process",
    "authorized",
    "in_mediation",
    "approved",
    "rejected",
    "cancelled",
    "refunded",
    "charged_back",
  ];
  if (
    !p.id ||
    !knownStatuses.includes(p.status) ||
    !Number.isFinite(updatedAt.getTime())
  )
    throw new HttpError(502, "Resposta de pagamento inválida.");
  await db.$transaction(async (tx) => {
    // Serialize webhook/reconciliation per order; stock release also updates this row.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${o.id} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({
      where: { id: o.id },
      include: { payment: true },
    });
    const payment = current.payment!;
    const eventKey = `mp:${p.id}:${p.status}:${p.date_last_updated}`;
    if (await tx.paymentTransaction.findUnique({ where: { eventKey } })) return;
    await tx.paymentTransaction.create({
      data: { paymentId: o.payment!.id, eventKey, status: p.status },
    });
    const stale =
      payment.providerUpdatedAt && updatedAt < payment.providerUpdatedAt;
    const terminal = ["refunded", "charged_back"].includes(payment.status);
    const downgrade =
      (terminal && p.status !== payment.status) ||
      (payment.status === "approved" &&
        !["approved", "refunded", "charged_back", "in_mediation"].includes(
          p.status,
        ));
    const differentPayment =
      payment.providerId &&
      payment.providerId !== String(p.id) &&
      ["approved", "refunded", "charged_back", "in_mediation"].includes(
        payment.status,
      );
    if (stale || downgrade || differentPayment) {
      await tx.auditLog.create({
        data: {
          actorId: "SYSTEM:payment",
          action: "payment.event_review",
          entityId: o.id,
          details: {
            eventKey,
            reason: differentPayment
              ? "different_payment"
              : stale
                ? "out_of_order"
                : "status_regression",
          },
        },
      });
      return;
    }
    await tx.payment.update({
      where: { id: o.payment!.id },
      data: {
        providerId: String(p.id),
        status: p.status,
        providerUpdatedAt: updatedAt,
      },
    });
    if (
      p.status === "approved" &&
      current.stockReleased &&
      current.status === "REFUNDING"
    )
      return;
    if (
      p.status === "approved" &&
      (current.stockReleased || current.status === "CANCELLED")
    ) {
      await tx.order.update({
        where: { id: o.id },
        data: { status: "REFUNDING" },
      });
      await tx.orderEvent.create({
        data: {
          orderId: o.id,
          status: "REFUNDING",
          note: "Pagamento recebido após cancelamento/liberação de estoque. Análise operacional necessária; nenhum reembolso foi executado.",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: "SYSTEM:payment",
          action: "payment.late_approval",
          entityId: o.id,
          details: { eventKey },
        },
      });
      await tx.mail.create({
        data: {
          recipient: o.email,
          subject: "Pagamento em análise — JN Chuteiras",
          body: `Recebemos um pagamento para o pedido ${o.id} após o cancelamento. Nossa equipe precisa analisar a situação antes de confirmar entrega ou reembolso.`,
        },
      });
    } else if (p.status === "approved") {
      const changed = await tx.order.updateMany({
        where: { id: o.id, status: "PENDING", stockReleased: false },
        data: { status: "PAID" },
      });
      if (changed.count) {
        await tx.orderEvent.create({
          data: {
            orderId: o.id,
            status: "PAID",
            note: "Confirmado pela API Mercado Pago.",
          },
        });
        await tx.mail.create({
          data: {
            recipient: o.email,
            subject: "Pagamento aprovado",
            body: `Pedido ${o.id} aprovado.`,
          },
        });
      }
    } else if (["refunded", "charged_back"].includes(p.status)) {
      await tx.order.update({
        where: { id: o.id },
        data: { status: "REFUNDING" },
      });
      await tx.orderEvent.create({
        data: {
          orderId: o.id,
          status: "REFUNDING",
          note: "Reembolso/contestação informado pelo provedor. Revisão manual de estoque.",
        },
      });
    }
  });
  return { received: true };
}
