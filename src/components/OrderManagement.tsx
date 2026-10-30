"use client";
import { useEffect, useState } from "react";
import { api, money, statusLabel } from "./Store";
const nextSteps: Record<string, string[]> = {
  PAID: ["PREPARING"],
  PREPARING: ["SHIPPED"],
  SHIPPED: ["IN_TRANSIT", "DELIVERED"],
  IN_TRANSIT: ["DELIVERED"],
};
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
function Detail({
  id,
  onChanged,
  notify,
}: {
  id: string;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [order, setOrder] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    api("admin/orders/" + id)
      .then((value) => {
        if (active) setOrder(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
          Tentar carregar novamente
        </button>
      </div>
    );
  if (!order) return <p role="status">Carregando detalhes…</p>;
  const address = order.address || {};
  return (
    <div>
      <p>
        {order.email} · {order.phone}
      </p>
      <p>Realizado em {date(order.createdAt)} (Brasília)</p>
      <h3>Itens e separação</h3>
      {order.items.map((item: any) => (
        <p key={item.id}>
          {item.quantity}× {item.name} · tamanho {item.size} · SKU{" "}
          {item.variant.sku} · {money(item.price * item.quantity)}
        </p>
      ))}
      <p>
        Produtos {money(order.subtotal)} · Desconto {money(order.discount)} ·
        Frete {money(order.shipping)} · Total {money(order.total)}
      </p>
      <h3>Entrega</h3>
      <p>
        {[
          address.street,
          address.number,
          address.complement,
          address.district,
          address.city,
          address.state,
          address.postcode,
        ]
          .filter(Boolean)
          .join(", ") || "Endereço não disponível."}
      </p>
      <p>
        {order.shippingService}
        {order.shipment?.trackingCode &&
          ` · Rastreio: ${order.shipment.trackingCode}`}
      </p>
      {order.shipment?.trackingUrl && (
        <a
          href={order.shipment.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-button"
        >
          Acompanhar na transportadora ↗
        </a>
      )}
      <p>Pagamento: {order.payment?.status || "Sem confirmação"}</p>
      {["creating", "uncertain"].includes(order.payment?.creationState) && (
        <p role="status">
          Preferência de pagamento ainda não confirmada. Consulte a conciliação
          antes de orientar novo pagamento.
        </p>
      )}
      {nextSteps[order.status]?.length ? (
        <form
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            try {
              await api(
                "admin/orders/" + id,
                {
                  status: form.get("status"),
                  ...(form.get("trackingCode")
                    ? { trackingCode: form.get("trackingCode") }
                    : {}),
                  ...(form.get("trackingUrl")
                    ? { trackingUrl: form.get("trackingUrl") }
                    : {}),
                },
                "PATCH",
              );
              notify("Logística atualizada.");
              await onChanged();
            } catch (e) {
              notify((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Próxima etapa
            <select name="status" disabled={busy}>
              {nextSteps[order.status].map((status) => (
                <option key={status} value={status}>
                  {statusLabel[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Código de rastreio
            <input
              name="trackingCode"
              maxLength={100}
              required={order.status === "PREPARING"}
              defaultValue={order.shipment?.trackingCode || ""}
              disabled={busy}
            />
          </label>
          <label>
            Link de rastreio HTTPS
            <input
              name="trackingUrl"
              type="url"
              pattern="https://.*"
              defaultValue={order.shipment?.trackingUrl || ""}
              disabled={busy}
            />
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Salvando…" : "Atualizar logística"}
          </button>
        </form>
      ) : (
        <p className="muted">
          Não há avanço logístico disponível nesta situação. Pagamentos e
          reembolsos dependem do provedor.
        </p>
      )}
      <h3>Histórico do pedido</h3>
      {order.events.length ? (
        <ol>
          {order.events.map((event: any) => (
            <li key={event.id}>
              <strong>{statusLabel[event.status]}</strong> ·{" "}
              {date(event.createdAt)}
              <p>{event.note}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>Nenhuma alteração registrada.</p>
      )}
    </div>
  );
}
function Card({
  order,
  onChanged,
  notify,
}: {
  order: any;
  onChanged: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        #{order.id.slice(-8)} · {order.name} · {money(order.total)} ·{" "}
        {statusLabel[order.status]}
      </summary>
      {open && <Detail id={order.id} onChanged={onChanged} notify={notify} />}
    </details>
  );
}
export default function OrderManagement({
  notify,
  onChanged,
}: {
  notify: (message: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState<Record<string, string>>({ page: "1" }),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api("admin/orders?" + new URLSearchParams(query))
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, revision]);
  const refresh = async () => {
    await onChanged();
    setRevision((n) => n + 1);
  };
  return (
    <section>
      <h2>Gestão de pedidos</h2>
      <form
        className="form-grid panel"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({
            ...(Object.fromEntries(new FormData(e.currentTarget)) as Record<
              string,
              string
            >),
            page: "1",
          });
        }}
      >
        <label>
          Buscar pedido
          <input
            name="q"
            type="search"
            maxLength={100}
            placeholder="Cliente, e-mail, final do pedido ou rastreio"
          />
        </label>
        <label>
          Situação do pedido
          <select name="status">
            <option value="">Todas</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input name="from" type="date" />
        </label>
        <label>
          Até
          <input name="to" type="date" />
        </label>
        <p className="muted span-two">
          Sem datas, pesquisa todo o histórico. Para filtrar por período,
          preencha as duas datas (dias de Brasília, até 366 dias).
        </p>
        <button className="btn" disabled={loading}>
          Filtrar pedidos
        </button>
        <button
          className="btn secondary"
          type="reset"
          onClick={() => setQuery({ page: "1" })}
        >
          Limpar filtros
        </button>
      </form>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">Carregando pedidos…</p>
      ) : (
        data && (
          <>
            <p role="status">
              {data.total} pedido(s) encontrado(s) · Página {data.page} de{" "}
              {data.pages}
            </p>
            {!data.orders.length && (
              <p>Nenhum pedido corresponde aos filtros.</p>
            )}
            {data.orders.map((order: any) => (
              <Card
                key={order.id + ":" + revision + ":" + JSON.stringify(query)}
                order={order}
                notify={notify}
                onChanged={refresh}
              />
            ))}
            <nav aria-label="Páginas de pedidos" className="inline-form">
              <button
                className="btn secondary btn-small"
                disabled={data.page <= 1}
                onClick={() =>
                  setQuery({ ...query, page: String(data.page - 1) })
                }
              >
                Pedidos anteriores
              </button>
              <button
                className="btn secondary btn-small"
                disabled={data.page >= data.pages}
                onClick={() =>
                  setQuery({ ...query, page: String(data.page + 1) })
                }
              >
                Próxima página de pedidos
              </button>
            </nav>
          </>
        )
      )}
    </section>
  );
}
