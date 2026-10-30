"use client";
import { useState } from "react";
import { api } from "./Store";
export const returnStatusLabel: Record<string, string> = {
  requested: "Em análise",
  approved: "Aprovada",
  rejected: "Não aprovada",
  received: "Produto recebido",
  refunded: "Reembolso confirmado",
};
const actions: Record<string, string[]> = {
  requested: ["approved", "rejected"],
  approved: ["received"],
  received: ["refunded"],
};
function ReturnCard({
  request: r,
  reload,
  notify,
}: {
  request: any;
  reload: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pending = ["processing", "uncertain"].includes(r.refundState);
  async function run(path: string, body: unknown, method: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api(path, body, method);
      notify(result.message || "Solicitação atualizada.");
      await reload();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className="panel"
      aria-label={`Solicitação do pedido ${r.orderId}`}
    >
      <h3>Pedido #{r.orderId.slice(-8)}</h3>
      <p>
        <strong>{returnStatusLabel[r.status] || r.status}</strong>
      </p>
      <p>Motivo: {r.reason}</p>
      {r.decisionNote && <p>Última observação: {r.decisionNote}</p>}
      {pending ? (
        <>
          <p role="status">
            Reembolso em consulta. Não repita a operação financeira; uma
            resposta incerta não significa que o dinheiro deixou de ser
            devolvido.
          </p>
          <button
            disabled={busy}
            className="btn secondary btn-small"
            onClick={() => run(`admin/returns/${r.id}/reconcile`, {}, "POST")}
          >
            {busy ? "Consultando…" : "Consultar reembolso"}
          </button>
        </>
      ) : actions[r.status]?.length ? (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const status = String(form.get("status"));
            if (
              status === "refunded" &&
              !window.confirm(
                "Enviar reembolso integral ao provedor? Esta operação financeira não pode ser desfeita.",
              )
            )
              return;
            await run(
              `admin/returns/${r.id}`,
              { status, version: r.version, note: form.get("note") },
              "PATCH",
            );
          }}
        >
          <label>
            Próxima ação
            <select name="status" disabled={busy}>
              {actions[r.status].map((status) => (
                <option key={status} value={status}>
                  {
                    {
                      approved: "Aprovar solicitação",
                      rejected: "Não aprovar solicitação",
                      received: "Confirmar recebimento físico",
                      refunded: "Reembolsar integralmente",
                    }[status]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            Observação para o cliente
            <textarea
              name="note"
              required
              minLength={10}
              maxLength={1000}
              disabled={busy}
              placeholder="Explique a decisão e as próximas orientações."
            />
          </label>
          <button disabled={busy} className="btn secondary btn-small">
            {busy ? "Salvando…" : "Aplicar decisão"}
          </button>
        </form>
      ) : null}
    </article>
  );
}
export default function ReturnManagement({
  requests,
  reload,
  notify,
}: {
  requests: any[];
  reload: () => Promise<void>;
  notify: (message: string) => void;
}) {
  return (
    <section>
      <h2>Solicitações de devolução</h2>
      {requests.length ? (
        requests.map((r) => (
          <ReturnCard
            key={r.id + ":" + r.version}
            request={r}
            reload={reload}
            notify={notify}
          />
        ))
      ) : (
        <p>Nenhuma solicitação.</p>
      )}
      <p className="muted">
        O reembolso depende da confirmação do provedor. O estoque não é reposto
        automaticamente: confira o produto e ajuste após inspeção.
      </p>
    </section>
  );
}
