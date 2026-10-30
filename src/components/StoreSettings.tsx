"use client";
import { useEffect, useState } from "react";
import { api } from "./Store";
export default function StoreSettings({
  config,
  save,
}: {
  config: any;
  save: (path: string, data: unknown, method: string) => Promise<boolean>;
}) {
  const [checks, setChecks] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    api("admin/settings/readiness")
      .then((value) => {
        if (active) setChecks(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [config.version]);
  return (
    <section className="panel">
      <h2>Operação comercial</h2>
      <p className="notice">
        Somente o administrador pode salvar. Segredos são configurados no
        servidor; nunca preencha chaves de pagamento ou senhas nestes campos.
      </p>
      {error && <p role="alert">{error}</p>}
      {checks && (
        <div className="panel">
          <h3>Preparação para vendas</h3>
          <ul>
            {checks.checks.map((check: any) => (
              <li key={check.id}>
                {check.configured ? "✓ Configurado" : "Pendente"} ·{" "}
                {check.label}
              </li>
            ))}
          </ul>
          <p className="muted">{checks.notice}</p>
          <p className="muted">
            A lista reflete os dados salvos. Não testa conexão, credenciais,
            estoque físico, domínio ou situação cadastral da empresa.
          </p>
        </div>
      )}
      <form
        key={config.version}
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const form = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await save(
              "admin/settings",
              {
                ...Object.fromEntries(form),
                version: config.version ?? 0,
                salesEnabled: form.get("salesEnabled") === "on",
                legalReviewed: form.get("legalReviewed") === "on",
                nationwideShipping: form.get("nationwideShipping") === "on",
                freeShippingMinimum: Math.round(
                  Number(form.get("freeShippingMinimum")) * 100,
                ),
              },
              "PUT",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {[
          ["company", "Razão social"],
          ["cnpj", "CNPJ (numérico ou alfanumérico)"],
          ["address", "Endereço da empresa"],
          ["email", "E-mail comercial"],
          ["whatsapp", "WhatsApp (DDI + DDD + número)"],
          ["hours", "Horário de atendimento"],
          ["bannerTitle", "Título do banner"],
          ["bannerSubtitle", "Texto do banner"],
          ["instagram", "Perfil no Instagram"],
          ["facebook", "Perfil no Facebook"],
          ["youtube", "Canal no YouTube"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <input
              name={name}
              type={
                name === "email"
                  ? "email"
                  : ["instagram", "facebook", "youtube"].includes(name)
                    ? "url"
                    : "text"
              }
              maxLength={
                name === "address" ||
                ["instagram", "facebook", "youtube"].includes(name)
                  ? 300
                  : name === "cnpj"
                    ? 30
                    : name === "bannerTitle"
                      ? 100
                      : name === "bannerSubtitle"
                        ? 200
                        : 150
              }
              required={name === "bannerTitle"}
              defaultValue={config[name] || ""}
              disabled={busy}
            />
          </label>
        ))}
        <label>
          Frete grátis a partir de R$ (0 desativa)
          <input
            type="number"
            step="0.01"
            min="0"
            max="1000000"
            name="freeShippingMinimum"
            defaultValue={(config.freeShippingMinimum || 0) / 100}
            disabled={busy}
          />
        </label>
        <label className="check-label span-two">
          <input
            type="checkbox"
            name="nationwideShipping"
            defaultChecked={config.nationwideShipping === true}
            disabled={busy}
          />
          A operação atende todo o Brasil (exibir essa condição quando as vendas
          estiverem ativas).
        </label>
        <label className="check-label span-two">
          <input
            type="checkbox"
            name="legalReviewed"
            defaultChecked={config.legalReviewed === true}
            disabled={busy}
          />
          A equipe confirma que revisou as políticas antes da ativação
          comercial.
        </label>
        <label className="check-label span-two">
          <input
            type="checkbox"
            name="salesEnabled"
            defaultChecked={config.salesEnabled === true}
            disabled={busy}
          />
          Habilitar vendas (depende das configurações obrigatórias).
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Salvando…" : "Salvar configurações"}
        </button>
      </form>
    </section>
  );
}
