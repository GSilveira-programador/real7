"use client";
import { useState } from "react";
const labels: Record<string, string> = {
  CUSTOMER: "Cliente",
  AGENT: "Atendente",
  MANAGER: "Gerente",
  ADMIN: "Administrador",
};
export default function UserPermissions({
  customers,
  me,
  mutate,
}: {
  customers: any[];
  me: any;
  mutate: (p: string, d: unknown, m?: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const target = customers.find((c) => c.id === editing);
  return (
    <section className="panel">
      <h2>Clientes e equipe</h2>
      <p className="muted">
        O perfil define permissões no servidor. Contas de equipe precisam de
        e-mail verificado e MFA para acessar a administração.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Verificação</th>
              {me.role === "ADMIN" && <th>Ação</th>}
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{labels[c.role]}</td>
                <td>
                  {c.verified ? "E-mail verificado" : "Verificação pendente"}
                  {c.role !== "CUSTOMER" && (
                    <small className="permission-state">
                      {c.mfaEnabled ? "MFA ativo" : "MFA pendente"}
                    </small>
                  )}
                </td>
                {me.role === "ADMIN" && (
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEditing(editing === c.id ? null : c.id)}
                    >
                      Alterar perfil de {c.name}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {target && me.role === "ADMIN" && (
        <form
          key={target.id + ":" + target.roleVersion}
          className="form-grid permission-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const f = Object.fromEntries(new FormData(e.currentTarget));
              const ok = await mutate(
                "admin/users/" + target.id + "/role",
                {
                  role: f.role,
                  version: target.roleVersion,
                  reason: f.reason,
                  code: f.code,
                },
                "PATCH",
              );
              if (ok) setEditing(null);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="span-two">Permissões de {target.name}</h3>
          <label>
            Novo perfil
            <select name="role" defaultValue={target.role}>
              {Object.entries(labels).map(([role, label]) => (
                <option key={role} value={role}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seu código MFA
            <input
              name="code"
              required
              pattern="[0-9]{6}"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
          <label className="span-two">
            Motivo da alteração
            <textarea name="reason" required minLength={10} maxLength={500} />
          </label>
          <p className="notice span-two">
            Ao salvar, todas as sessões dessa conta serão encerradas. O último
            administrador com MFA ativo não pode ser removido. Promover uma
            conta não dispensa a configuração do autenticador.
          </p>
          <button className="btn" disabled={busy}>
            {busy ? "Salvando…" : "Salvar permissões"}
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setEditing(null)}
          >
            Cancelar
          </button>
        </form>
      )}
    </section>
  );
}
