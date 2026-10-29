"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Users,
  Settings,
  Tag,
  ArrowUpRight,
  Plus,
  Trash2,
  ShieldCheck,
  RefreshCcw,
} from "lucide-react";
import { api, money, statusLabel } from "./Store";
import ProductEditor from "./ProductEditor";
import UserPermissions from "./UserPermissions";
import SalesReport from "./SalesReport";
import MerchandisingPanel from "./MerchandisingPanel";
export default function Admin({
  me,
  notify,
}: {
  me: any;
  notify: (m: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("overview"),
    [adding, setAdding] = useState(false);
  const load = () =>
    api("admin/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [me]);
  const mutate = async (path: string, body: unknown, method?: string) => {
    try {
      await api(path, body, method);
      notify("Alteração salva.");
      await load();
      return true;
    } catch (e) {
      notify((e as Error).message);
      return false;
    }
  };
  if (!me)
    return (
      <div className="container empty">
        <ShieldCheck size={40} />
        <h1>Acesso administrativo</h1>
        <p>Entre com uma conta autorizada e autenticação multifator.</p>
        <Link className="btn" href="/conta">
          Entrar na conta
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="container empty">
        <ShieldCheck size={40} />
        <h1>Confirme seu acesso.</h1>
        <p>{error}</p>
        <Link className="btn" href="/conta">
          Configurar MFA na minha conta
        </Link>
      </div>
    );
  if (!data) return <div className="container page">Carregando painel…</div>;
  const paid = data.orders.filter((o: any) =>
    ["PAID", "PREPARING", "SHIPPED", "IN_TRANSIT", "DELIVERED"].includes(
      o.status,
    ),
  );
  const revenue = paid.reduce((s: number, o: any) => s + o.total, 0);
  const low = data.products.flatMap((p: any) =>
    p.variants
      .filter((v: any) => p.active && v.active && v.stock < 5)
      .map((v: any) => ({ ...v, name: p.name })),
  );
  const tabs = [
    ["overview", "Visão geral", LayoutDashboard],
    ["products", "Produtos e estoque", Package],
    ["reports", "Relatórios", LayoutDashboard],
    ["content", "Banners e campanhas", Tag],
    ["orders", "Pedidos", ClipboardList],
    ["customers", "Clientes", Users],
    ["coupons", "Cupons", Tag],
    ["returns", "Devoluções", RefreshCcw],
    ["settings", "Configurações", Settings],
  ] as const;
  return (
    <div className="container page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ELITE BOOTS / BACK OFFICE</span>
          <h1>Controle do jogo.</h1>
        </div>
        <span className="status">
          <ShieldCheck size={16} /> {me.role} · MFA ativo
        </span>
      </div>
      <div className="admin-layout">
        <aside className="admin-nav">
          {tabs
            .filter(([id]) =>
              me.role === "AGENT"
                ? ["overview", "orders", "customers"].includes(id)
                : id !== "settings" || me.role === "ADMIN",
            )
            .map(([id, label, I]) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                <I size={17} />
                {label}
              </button>
            ))}
          {me.role !== "AGENT" && (
            <>
              <a className="text-button" href="/api/admin/export">
                Exportar CSV <ArrowUpRight size={15} />
              </a>
              <a className="text-button" href="/api/admin/export?format=xlsx">
                Exportar Excel <ArrowUpRight size={15} />
              </a>
            </>
          )}
        </aside>
        <div className="admin-content">
          {tab === "overview" && (
            <>
              <div className="metrics">
                {[
                  ["Faturamento aprovado", money(revenue)],
                  ["Pedidos", data.orders.length],
                  [
                    "Aguardando pagamento",
                    data.orders.filter((o: any) => o.status === "PENDING")
                      .length,
                  ],
                  [
                    "Ticket médio",
                    money(paid.length ? Math.round(revenue / paid.length) : 0),
                  ],
                ].map(([label, value]) => (
                  <div className="panel" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="muted">
                Indicadores calculados sobre os últimos 200 pedidos. Sem vendas
                fictícias ou conversão estimada.
              </p>
              <section className="panel">
                <h2>Estoque baixo</h2>
                {low.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Tamanho</th>
                          <th>Disponível</th>
                        </tr>
                      </thead>
                      <tbody>
                        {low.map((v: any) => (
                          <tr key={v.id}>
                            <td>{v.name}</td>
                            <td>{v.size}</td>
                            <td>{v.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p>Nenhum alerta de estoque.</p>
                )}
              </section>
              <section className="panel">
                <h2>Mensagens de atendimento</h2>
                {data.contacts.length ? (
                  data.contacts.map((c: any) => (
                    <details key={c.id}>
                      <summary>
                        {c.name} · {c.email}
                      </summary>
                      <p>{c.message}</p>
                    </details>
                  ))
                ) : (
                  <p>Nenhuma mensagem recebida.</p>
                )}
              </section>
            </>
          )}
          {tab === "products" && (
            <>
              <div className="section-heading">
                <h2>Catálogo e variações</h2>
                <button
                  className="btn btn-small"
                  onClick={() => setAdding(!adding)}
                >
                  <Plus size={17} /> Novo produto
                </button>
              </div>
              {adding && (
                <form
                  className="panel form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = Object.fromEntries(new FormData(form));
                    const variants = String(f.sizes)
                      .split(",")
                      .map((s) => ({
                        size: Number(s.trim()),
                        stock: Number(f.stock),
                        sku: String(f.slug) + "-" + s.trim(),
                      }));
                    if (
                      await mutate("admin/products", {
                        ...f,
                        price: Math.round(Number(f.price) * 100),
                        compareAt: f.compareAt
                          ? Math.round(Number(f.compareAt) * 100)
                          : null,
                        active: true,
                        featured: false,
                        demo: false,
                        weightGrams: Number(f.weightGrams),
                        widthCm: Number(f.widthCm),
                        heightCm: Number(f.heightCm),
                        lengthCm: Number(f.lengthCm),
                        variants,
                      })
                    ) {
                      form.reset();
                      setAdding(false);
                    }
                  }}
                >
                  <h3 className="span-two">Cadastrar produto real</h3>
                  <label className="span-two">
                    Enviar imagem (JPEG, PNG ou WebP, até 5 MB)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const r = await fetch("/api/admin/uploads", {
                            method: "POST",
                            headers: { "Content-Type": f.type },
                            body: f,
                          });
                          const d = await r.json();
                          if (!r.ok) throw new Error(d.error);
                          const input = e.target.form?.elements.namedItem(
                            "image",
                          ) as HTMLInputElement;
                          if (input) input.value = d.url;
                          notify("Imagem enviada.");
                        } catch (err) {
                          notify((err as Error).message);
                        }
                      }}
                    />
                  </label>
                  {[
                    ["name", "Nome"],
                    ["slug", "URL amigável"],
                    ["model", "Linha/modelo"],
                    ["color", "Cor"],
                    ["material", "Material"],
                    ["sole", "Solado"],
                    ["image", "URL HTTPS da imagem autorizada"],
                    ["price", "Preço em reais"],
                    ["compareAt", "Preço anterior (opcional)"],
                    ["sizes", "Numerações separadas por vírgula"],
                    ["stock", "Estoque por tamanho"],
                    ["weightGrams", "Peso embalado (g)"],
                    ["widthCm", "Largura embalagem (cm)"],
                    ["heightCm", "Altura embalagem (cm)"],
                    ["lengthCm", "Comprimento embalagem (cm)"],
                  ].map(([name, label]) => (
                    <label key={name}>
                      {label}
                      <input
                        required={name !== "compareAt"}
                        name={name}
                        type={
                          [
                            "price",
                            "stock",
                            "compareAt",
                            "weightGrams",
                            "widthCm",
                            "heightCm",
                            "lengthCm",
                          ].includes(name)
                            ? "number"
                            : "text"
                        }
                        step={
                          name.includes("price") || name === "compareAt"
                            ? "0.01"
                            : undefined
                        }
                      />
                    </label>
                  ))}
                  <label>
                    Marca
                    <select name="brandId">
                      {data.brands.map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Categoria
                    <select name="categoryId">
                      {data.categories.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Terreno
                    <select name="ground">
                      <option>Campo</option>
                      <option>Society</option>
                      <option>Futsal</option>
                    </select>
                  </label>
                  <label className="span-two">
                    Descrição
                    <textarea required minLength={20} name="description" />
                  </label>
                  <button className="btn">Salvar produto</button>
                  <p className="muted">
                    Use imagens hospedadas em armazenamento com autorização de
                    uso. O upload usa armazenamento S3 configurado pelo
                    servidor.
                  </p>
                </form>
              )}
              {data.products.map((p: any) => (
                <ProductEditor
                  key={p.id + ":" + p.version}
                  product={p}
                  brands={data.brands}
                  categories={data.categories}
                  mutate={mutate}
                />
              ))}
              <section className="panel">
                <h3>Marcas e categorias</h3>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await mutate("admin/brands", {
                      name: new FormData(e.currentTarget).get("name"),
                    });
                  }}
                >
                  <input
                    name="name"
                    required
                    placeholder="Nome da marca"
                    aria-label="Nova marca"
                  />
                  <button className="btn btn-small">Adicionar marca</button>
                </form>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await mutate(
                      "admin/categories",
                      Object.fromEntries(new FormData(e.currentTarget)),
                    );
                  }}
                >
                  <input
                    name="name"
                    required
                    placeholder="Categoria"
                    aria-label="Nova categoria"
                  />
                  <input
                    name="slug"
                    required
                    placeholder="slug-da-categoria"
                    aria-label="Slug da categoria"
                  />
                  <button className="btn btn-small">Adicionar</button>
                </form>
              </section>
            </>
          )}
          {tab === "reports" && <SalesReport />}
          {tab === "content" && (
            <MerchandisingPanel data={data} mutate={mutate} />
          )}
          {tab === "orders" && (
            <section className="panel">
              <h2>Gestão de pedidos</h2>
              {!data.orders.length && <p>Nenhum pedido registrado.</p>}
              {data.orders.map((o: any) => (
                <details key={o.id}>
                  <summary>
                    #{o.id.slice(-8)} · {o.name} · {money(o.total)} ·{" "}
                    {statusLabel[o.status]}
                  </summary>
                  <p>
                    {o.email} · {o.phone}
                  </p>
                  {o.items.map((i: any) => (
                    <p key={i.id}>
                      {i.quantity}× {i.name} · {i.size}
                    </p>
                  ))}
                  <p>Pagamento: {o.payment?.status || "pendente"}</p>
                  <form
                    className="form-grid"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      await mutate(
                        "admin/orders/" + o.id,
                        {
                          status: f.status,
                          ...(f.trackingCode
                            ? { trackingCode: f.trackingCode }
                            : {}),
                          ...(f.trackingUrl
                            ? { trackingUrl: f.trackingUrl }
                            : {}),
                        },
                        "PATCH",
                      );
                    }}
                  >
                    <label>
                      Próxima etapa
                      <select name="status">
                        {[
                          "PREPARING",
                          "SHIPPED",
                          "IN_TRANSIT",
                          "DELIVERED",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {statusLabel[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Rastreio
                      <input name="trackingCode" />
                    </label>
                    <label>
                      Link HTTPS
                      <input name="trackingUrl" type="url" />
                    </label>
                    <button className="btn">Atualizar logística</button>
                  </form>
                  <p className="muted">
                    Pagamentos são confirmados pelo provedor. Cancelamentos
                    financeiros e reembolsos exigem conciliação; não podem ser
                    forçados pelo painel.
                  </p>
                </details>
              ))}
            </section>
          )}
          {tab === "customers" && (
            <UserPermissions
              customers={data.customers}
              me={me}
              mutate={mutate}
            />
          )}
          {tab === "coupons" && (
            <section className="panel">
              <h2>Cupons</h2>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  await mutate("admin/coupons", {
                    code: String(f.code).toUpperCase(),
                    percent: Number(f.percent),
                    minimum: Math.round(Number(f.minimum) * 100),
                    limit: f.limit ? Number(f.limit) : null,
                  });
                }}
              >
                {[
                  ["code", "Código"],
                  ["percent", "Desconto %"],
                  ["minimum", "Mínimo em R$"],
                  ["limit", "Limite de usos"],
                ].map(([n, l]) => (
                  <label key={n}>
                    {l}
                    <input
                      required
                      name={n}
                      type={n === "code" ? "text" : "number"}
                      min="0"
                    />
                  </label>
                ))}
                <button className="btn">Criar cupom</button>
              </form>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Desconto</th>
                    <th>Usos</th>
                    <th>Status</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.map((c: any) => (
                    <tr key={c.code}>
                      <td>{c.code}</td>
                      <td>{c.percent}%</td>
                      <td>
                        {c.used}/{c.limit || "∞"}
                      </td>
                      <td>{c.active ? "Ativo" : "Inativo"}</td>
                      <td>
                        <button
                          className="text-button"
                          disabled={!c.active}
                          onClick={() =>
                            mutate("admin/coupons/" + c.code, {}, "DELETE")
                          }
                        >
                          Desativar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          {tab === "returns" && (
            <>
              <section className="panel">
                <h2>Solicitações de devolução</h2>
                {data.returns.length ? (
                  data.returns.map((r: any) => (
                    <div key={r.id}>
                      <p>
                        Pedido {r.orderId} · {r.reason} · {r.status}
                      </p>
                      <div className="inline-form">
                        {(
                          {
                            requested: ["approved", "rejected"],
                            approved: ["received"],
                            received: ["refunded"],
                          } as Record<string, string[]>
                        )[r.status]?.map((next) => (
                          <button
                            key={next}
                            className="btn secondary btn-small"
                            onClick={() => {
                              if (
                                next !== "refunded" ||
                                window.confirm(
                                  "Confirmar reembolso integral pelo provedor? Esta operação financeira não pode ser desfeita.",
                                )
                              )
                                mutate(
                                  "admin/returns/" + r.id,
                                  { status: next },
                                  "PATCH",
                                );
                            }}
                          >
                            {
                              (
                                {
                                  approved: "Aprovar",
                                  rejected: "Recusar",
                                  received: "Confirmar recebimento",
                                  refunded: "Reembolsar integralmente",
                                } as Record<string, string>
                              )[next]
                            }
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p>Nenhuma solicitação.</p>
                )}
                <p className="muted">
                  O reembolso depende da confirmação do provedor. Confira o
                  recebimento físico e ajuste o estoque separadamente após
                  inspeção.
                </p>
              </section>
              <section className="panel">
                <h2>Moderação de avaliações</h2>
                {data.reviews.length ? (
                  data.reviews.map((r: any) => (
                    <div key={r.id}>
                      <p>
                        {"★".repeat(r.rating)} {r.text}
                      </p>
                      <button
                        className="btn btn-small"
                        onClick={() =>
                          mutate(
                            "admin/reviews/" + r.id,
                            { approved: !r.approved },
                            "PATCH",
                          )
                        }
                      >
                        {r.approved ? "Ocultar" : "Aprovar"}
                      </button>
                    </div>
                  ))
                ) : (
                  <p>Nenhuma avaliação recebida.</p>
                )}
              </section>
            </>
          )}
          {tab === "settings" && (
            <section className="panel">
              <h2>Operação comercial</h2>
              <p className="notice">
                Somente o administrador pode salvar estas configurações. A
                ativação de vendas depende das credenciais externas.
              </p>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  await mutate(
                    "admin/settings",
                    {
                      ...f,
                      salesEnabled: f.salesEnabled === "on",
                      freeShippingMinimum: Math.round(
                        Number(f.freeShippingMinimum) * 100,
                      ),
                    },
                    "PUT",
                  );
                }}
              >
                {[
                  ["company", "Razão social"],
                  ["cnpj", "CNPJ"],
                  ["address", "Endereço da empresa"],
                  ["email", "E-mail comercial"],
                  ["whatsapp", "WhatsApp (DDI + DDD + número)"],
                  ["hours", "Horário de atendimento"],
                  ["bannerTitle", "Título do banner"],
                  ["bannerSubtitle", "Texto do banner"],
                ].map(([n, l]) => (
                  <label key={n}>
                    {l}
                    <input name={n} defaultValue={data.settings[n] || ""} />
                  </label>
                ))}
                <label>
                  Frete grátis a partir de R$ (0 desativa)
                  <input
                    type="number"
                    name="freeShippingMinimum"
                    defaultValue={data.settings.freeShippingMinimum / 100}
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    name="salesEnabled"
                    defaultChecked={data.settings.salesEnabled}
                  />{" "}
                  Habilitar vendas
                </label>
                <button className="btn">Salvar configurações</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
