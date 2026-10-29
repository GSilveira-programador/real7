"use client";
import { useState } from "react";
import Link from "next/link";
type Mutation = (
  path: string,
  data: unknown,
  method?: string,
) => Promise<boolean>;
function localDate(value?: string) {
  const d = value ? new Date(value) : new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function ContentForm({
  kind,
  value,
  campaigns,
  coupons,
  mutate,
  done,
}: {
  kind: "banners" | "campaigns";
  value?: any;
  campaigns: any[];
  coupons: any[];
  mutate: Mutation;
  done?: () => void;
}) {
  const banner = kind === "banners";
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const f = Object.fromEntries(new FormData(e.currentTarget));
          const common = {
            active: f.active === "on",
            startsAt: new Date(String(f.startsAt)).toISOString(),
            endsAt: new Date(String(f.endsAt)).toISOString(),
          };
          const data = banner
            ? {
                ...common,
                title: f.title,
                subtitle: f.subtitle,
                image: f.image,
                imageAlt: f.imageAlt,
                ctaLabel: f.ctaLabel,
                href: f.href,
                position: Number(f.position),
                campaignId: f.campaignId || null,
              }
            : { ...common, name: f.name, couponCode: f.couponCode || null };
          const ok = await mutate(
            "admin/" + kind + (value ? "/" + value.id : ""),
            { ...data, ...(value ? { version: value.version } : {}) },
            value ? "PUT" : "POST",
          );
          if (ok) done?.();
        } finally {
          setBusy(false);
        }
      }}
    >
      {banner ? (
        <>
          <label className="span-two">
            Título do banner
            <textarea
              name="title"
              maxLength={100}
              required
              defaultValue={value?.title}
            />
          </label>
          <label className="span-two">
            Texto complementar
            <input
              name="subtitle"
              maxLength={200}
              defaultValue={value?.subtitle || ""}
            />
          </label>
          <label className="span-two">
            URL da imagem
            <input
              name="image"
              required
              defaultValue={value?.image || "/images/boot-0.svg"}
            />
          </label>
          <label className="span-two">
            Descrição acessível da imagem
            <input
              name="imageAlt"
              minLength={5}
              maxLength={180}
              required
              defaultValue={
                value?.imageAlt || "Ilustração demonstrativa de chuteira"
              }
            />
          </label>
          <label>
            Texto do botão
            <input
              name="ctaLabel"
              maxLength={45}
              required
              defaultValue={value?.ctaLabel || "ENCONTRE SUA CHUTEIRA"}
            />
          </label>
          <label>
            Destino dentro da loja
            <input
              name="href"
              required
              defaultValue={value?.href || "/catalogo"}
            />
          </label>
          <label>
            Ordem de exibição
            <input
              type="number"
              name="position"
              min="0"
              max="1000"
              required
              defaultValue={value?.position || 0}
            />
          </label>
          <label>
            Campanha associada
            <select name="campaignId" defaultValue={value?.campaignId || ""}>
              <option value="">Sem campanha</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.active ? "ativa" : "inativa"}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="span-two">
            Nome da campanha
            <input
              name="name"
              required
              minLength={3}
              maxLength={120}
              defaultValue={value?.name}
            />
          </label>
          <label className="span-two">
            Cupom associado (opcional)
            <select name="couponCode" defaultValue={value?.couponCode || ""}>
              <option value="">Sem cupom</option>
              {coupons.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.active ? "ativo" : "inativo"}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Início
        <input
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={localDate(value?.startsAt)}
        />
      </label>
      <label>
        Fim
        <input
          name="endsAt"
          type="datetime-local"
          required
          defaultValue={localDate(
            value?.endsAt || new Date(Date.now() + 7 * 86400000).toISOString(),
          )}
        />
      </label>
      <label className="check-label span-two">
        <input
          name="active"
          type="checkbox"
          defaultChecked={value?.active || false}
        />{" "}
        Publicação habilitada dentro do período
      </label>
      <p className="muted span-two">
        Horários no fuso do navegador. Um banner associado só aparece se a
        campanha e o banner estiverem ativos no momento. Descontos continuam
        sujeitos às regras do cupom, sem alteração automática de preços.
      </p>
      <button className="btn" disabled={busy}>
        {busy
          ? "Salvando…"
          : value
            ? "Salvar alterações"
            : banner
              ? "Criar banner"
              : "Criar campanha"}
      </button>
    </form>
  );
}
export default function MerchandisingPanel({
  data,
  mutate,
}: {
  data: any;
  mutate: Mutation;
}) {
  const [adding, setAdding] = useState<"banners" | "campaigns" | null>(null);
  return (
    <section>
      <div className="section-heading">
        <h2>Banners e campanhas.</h2>
        <Link className="text-button" href="/" target="_blank">
          Ver a loja ↗
        </Link>
      </div>
      <div className="content-actions">
        <button
          className="btn btn-small"
          onClick={() => setAdding(adding === "banners" ? null : "banners")}
        >
          Novo banner
        </button>
        <button
          className="btn secondary btn-small"
          onClick={() => setAdding(adding === "campaigns" ? null : "campaigns")}
        >
          Nova campanha
        </button>
      </div>
      {adding && (
        <section className="panel">
          <h3>{adding === "banners" ? "Novo banner" : "Nova campanha"}</h3>
          <ContentForm
            key={adding}
            kind={adding}
            campaigns={data.campaigns}
            coupons={data.coupons}
            mutate={mutate}
            done={() => setAdding(null)}
          />
        </section>
      )}
      <h3>Campanhas</h3>
      {data.campaigns.length ? (
        data.campaigns.map((c: any) => (
          <details className="panel" key={c.id + ":" + c.version}>
            <summary>
              {c.name} · {c.active ? "Habilitada" : "Pausada"}
            </summary>
            <ContentForm
              kind="campaigns"
              value={c}
              campaigns={data.campaigns}
              coupons={data.coupons}
              mutate={mutate}
            />
            <button
              className="text-button"
              disabled={!c.active}
              onClick={() =>
                mutate(
                  "admin/campaigns/" + c.id,
                  { version: c.version },
                  "DELETE",
                )
              }
            >
              Pausar campanha
            </button>
          </details>
        ))
      ) : (
        <p className="muted">Nenhuma campanha criada.</p>
      )}
      <h3>Banners</h3>
      {data.banners.length ? (
        data.banners.map((b: any) => (
          <details className="panel" key={b.id + ":" + b.version}>
            <summary>
              {b.title.replaceAll("\n", " ")} · posição {b.position} ·{" "}
              {b.active ? "Habilitado" : "Pausado"}
            </summary>
            <img className="banner-preview" src={b.image} alt={b.imageAlt} />
            <ContentForm
              kind="banners"
              value={b}
              campaigns={data.campaigns}
              coupons={data.coupons}
              mutate={mutate}
            />
            <button
              className="text-button"
              disabled={!b.active}
              onClick={() =>
                mutate(
                  "admin/banners/" + b.id,
                  { version: b.version },
                  "DELETE",
                )
              }
            >
              Pausar banner
            </button>
          </details>
        ))
      ) : (
        <p className="muted">
          Sem banners publicados, a loja utiliza a composição visual padrão.
        </p>
      )}
    </section>
  );
}
