"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { api } from "./Store";
export default function ActivateAdmin() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [show, setShow] = useState(false);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") || "";
    setToken(value);
    history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <main className="container page" style={{ maxWidth: 650 }}>
      <Link href="/" className="text-button">
        JN Chuteiras
      </Link>
      <h1>Seu acesso administrativo</h1>
      <p>
        Escolha sua senha aqui. Em seguida, entre na conta e configure o
        autenticador para proteger o painel.
      </p>
      {message && (
        <p role={done ? "status" : "alert"} className="notice">
          {message}
        </p>
      )}
      {done ? (
        <Link href="/conta" className="btn">
          Entrar e configurar autenticador
        </Link>
      ) : token ? (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = new FormData(e.currentTarget);
            if (form.get("password") !== form.get("confirm")) {
              setMessage("As senhas precisam ser iguais.");
              return;
            }
            setBusy(true);
            setMessage("");
            try {
              const result = await api("auth/admin-invitation", {
                token,
                name: form.get("name"),
                email: form.get("email"),
                password: form.get("password"),
              });
              setDone(true);
              setToken("");
              setMessage(result.message);
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Seu nome
            <input
              name="name"
              required
              minLength={3}
              maxLength={100}
              autoComplete="name"
              disabled={busy}
            />
          </label>
          <label>
            E-mail do convite
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              disabled={busy}
            />
          </label>
          <label>
            Escolha sua senha
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label>
            Repita a senha
            <input
              name="confirm"
              type={show ? "text" : "password"}
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              disabled={busy}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={show}
              onChange={(e) => setShow(e.target.checked)}
            />
            Mostrar senha enquanto digito
          </label>
          <button className="btn" disabled={busy}>
            {busy ? "Criando conta…" : "Criar meu acesso"}
          </button>
        </form>
      ) : (
        <div className="panel">
          <h2>Você precisa do convite inicial</h2>
          <p>
            No terminal do ambiente onde a loja está rodando, execute{" "}
            <code>npm run admin:invite</code>. Informe seu e-mail e abra o link
            privado gerado. O convite só funciona quando ainda não existe
            administrador.
          </p>
          <Link href="/conta" className="text-button">
            Já tenho conta → Entrar
          </Link>
        </div>
      )}
    </main>
  );
}
