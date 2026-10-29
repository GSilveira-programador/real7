import { mp, syncPayment } from "./payments";
import { HttpError } from "./security";

// An empty search is not evidence that a preference cannot still receive payment.
// This function reconciles observations only; it never releases stock.
export async function reconcileOrderPayments(orderId: string) {
  const seen = new Set<string>();
  const limit = 50;
  for (let offset = 0; offset < 1000; offset += limit) {
    const page = await mp(
      `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&limit=${limit}&offset=${offset}&sort=date_created&criteria=asc`,
    );
    const total = page.paging?.total;
    if (
      !Array.isArray(page.results) ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      page.results.length > limit ||
      total < offset + page.results.length
    )
      throw new HttpError(502, "Paginação de pagamentos inválida.");
    if (page.results.length === 0 && total > offset)
      throw new HttpError(502, "Consulta de pagamentos incompleta.");
    for (const payment of page.results) {
      if (!payment.id || String(payment.external_reference) !== orderId)
        throw new HttpError(502, "Referência de pagamento divergente.");
      const id = String(payment.id);
      if (!seen.has(id)) {
        await syncPayment(id);
        seen.add(id);
      }
    }
    if (offset + page.results.length >= total) return { payments: seen.size };
    if (page.results.length < limit)
      throw new HttpError(502, "Consulta de pagamentos incompleta.");
  }
  throw new HttpError(
    502,
    "Consulta excedeu o limite de pagamentos; análise operacional necessária.",
  );
}
