import { it, expect, vi, beforeEach } from "vitest";
vi.mock("../src/lib/payments", () => ({ mp: vi.fn(), syncPayment: vi.fn() }));
import { mp, syncPayment } from "../src/lib/payments";
import { reconcileOrderPayments } from "../src/lib/reconciliation";
beforeEach(() => vi.resetAllMocks());
const payment = (id: number) => ({ id, external_reference: "order-test" });
it("consulta todas as páginas e confirma cada pagamento no backend", async () => {
  vi.mocked(mp)
    .mockResolvedValueOnce({
      results: Array.from({ length: 50 }, (_, i) => payment(i + 1)),
      paging: { total: 51 },
    })
    .mockResolvedValueOnce({ results: [payment(51)], paging: { total: 51 } });
  expect(await reconcileOrderPayments("order-test")).toEqual({ payments: 51 });
  expect(syncPayment).toHaveBeenCalledTimes(51);
  expect(vi.mocked(mp).mock.calls[1][0]).toContain("offset=50");
});
it("busca vazia válida não confirma nenhum pagamento", async () => {
  vi.mocked(mp).mockResolvedValue({ results: [], paging: { total: 0 } });
  expect(await reconcileOrderPayments("order-test")).toEqual({ payments: 0 });
  expect(syncPayment).not.toHaveBeenCalled();
});
it("recusa referência de outro pedido", async () => {
  vi.mocked(mp).mockResolvedValue({
    results: [{ id: 1, external_reference: "outro" }],
    paging: { total: 1 },
  });
  await expect(reconcileOrderPayments("order-test")).rejects.toThrow(
    "divergente",
  );
  expect(syncPayment).not.toHaveBeenCalled();
});
it("consulta malformada ou parcial não é tratada como ausência de pagamento", async () => {
  for (const page of [
    { results: [] },
    { results: [], paging: { total: 1 } },
    { results: [payment(1)], paging: { total: 2 } },
    { results: [payment(1)], paging: { total: -1 } },
  ]) {
    vi.mocked(mp).mockResolvedValue(page);
    await expect(reconcileOrderPayments("order-test")).rejects.toThrow();
  }
});
it("falha de confirmação interrompe a conciliação sem ignorar erro", async () => {
  vi.mocked(mp).mockResolvedValue({
    results: [payment(1)],
    paging: { total: 1 },
  });
  vi.mocked(syncPayment).mockRejectedValue(new Error("provider unavailable"));
  await expect(reconcileOrderPayments("order-test")).rejects.toThrow(
    "provider unavailable",
  );
});
