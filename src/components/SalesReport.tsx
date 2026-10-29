"use client";
import { useEffect, useState } from "react";
import { api, money, statusLabel } from "./Store";
function dateNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export default function SalesReport() {
  const today = dateNow();
  const [range, setRange] = useState({
      from: today.slice(0, 8) + "01",
      to: today,
    }),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async (from: string, to: string) => {
    setBusy(true);
    setError("");
    setData(null);
    try {
      setData(await api("admin/reports?" + new URLSearchParams({ from, to })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load(range.from, range.to);
  }, []);
  const max = data ? Math.max(1, ...data.daily.map((v: any) => v.revenue)) : 1;
  return (
    <section aria-label="Relatórios de vendas">
      <h2>O desempenho de cada período.</h2>
      <form
        className="panel report-range"
        onSubmit={(e) => {
          e.preventDefault();
          load(range.from, range.to);
        }}
      >
        <label>
          De
          <input
            type="date"
            required
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            required
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <button className="btn btn-small" disabled={busy}>
          {busy ? "Consultando…" : "Aplicar período"}
        </button>
      </form>
      <p className="muted">
        Dias de Brasília (America/Sao_Paulo). Todos os pedidos criados no
        período são considerados, sem limite de 200 registros. Faturamento
        inclui pedidos aprovados, em preparação, enviados e entregues; pedidos
        em devolução ficam separados. Não há taxa de conversão sem dados de
        navegação.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <p className="muted">
            Período aplicado: {data.from.split("-").reverse().join("/")} a{" "}
            {data.to.split("-").reverse().join("/")}.
          </p>
          <div className="metrics">
            {[
              ["Faturamento aprovado", money(data.revenue)],
              ["Pedidos no período", data.orders],
              ["Pedidos aprovados", data.paidOrders],
              ["Ticket médio", money(data.averageTicket)],
            ].map(([name, value]) => (
              <div className="panel" key={name}>
                <small>{name}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <section className="panel">
            <h3>Faturamento diário</h3>
            {data.revenue === 0 ? (
              <p>Nenhum faturamento aprovado neste período.</p>
            ) : (
              <svg
                className="sales-chart"
                viewBox={`0 0 ${Math.max(data.daily.length * 18, 180)} 120`}
                role="img"
                aria-label={
                  "Faturamento diário de " + data.from + " a " + data.to
                }
              >
                <title>
                  Faturamento diário aprovado. Valores detalhados na tabela
                  abaixo.
                </title>
                {data.daily.map((v: any, i: number) => (
                  <rect
                    key={v.day}
                    x={i * 18 + 2}
                    y={110 - (v.revenue / max) * 95}
                    width={12}
                    height={(v.revenue / max) * 95}
                    rx={2}
                  >
                    <title>
                      {v.day}: {money(v.revenue)}
                    </title>
                  </rect>
                ))}
              </svg>
            )}
            <details>
              <summary>Ver valores de todos os dias</summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Pedidos criados</th>
                      <th>Faturamento aprovado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((v: any) => (
                      <tr key={v.day}>
                        <td>{v.day.split("-").reverse().join("/")}</td>
                        <td>{v.orders}</td>
                        <td>{money(v.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <section className="panel">
            <h3>Produtos mais vendidos no período</h3>
            {data.topProducts.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Unidades</th>
                      <th>Valor dos itens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{p.units}</td>
                        <td>{money(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>O ranking será exibido quando existirem vendas aprovadas.</p>
            )}
          </section>
          <section className="panel">
            <h3>Pedidos por situação</h3>
            {data.statuses.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Situação</th>
                    <th>Pedidos</th>
                    <th>Valor dos pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.statuses.map((s: any) => (
                    <tr key={s.status}>
                      <td>{statusLabel[s.status]}</td>
                      <td>{s.count}</td>
                      <td>{money(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Nenhum pedido neste período.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
