"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mail, ShieldCheck, ArrowUpRight } from "lucide-react";
import { api } from "./Store";
export default function NewsletterPreferences() {
  const params = useSearchParams(),
    confirm = params.get("confirm"),
    unsubscribe = params.get("unsubscribe");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const token = unsubscribe || confirm;
  const action = unsubscribe
    ? "unsubscribe"
    : confirm
      ? "confirm"
      : "preferences";
  return (
    <div className="container page">
      <section className="panel newsletter-preferences">
        <span className="eyebrow">SEU E-MAIL. SUA ESCOLHA.</span>
        {unsubscribe ? <ShieldCheck size={35} /> : <Mail size={35} />}
        <h1>
          {unsubscribe
            ? "Cancelar inscrição."
            : confirm
              ? "Confirme seu lugar no time."
              : "Suas preferências de e-mail."}
        </h1>
        <p>
          {unsubscribe
            ? "Você pode deixar de receber novidades sem entrar em uma conta. Confirme abaixo para aplicar o descadastro."
            : confirm
              ? "Confirme que este endereço é seu e que deseja receber novidades da JN Chuteiras. Nenhum envio promocional será ativado apenas por preencher o formulário da loja."
              : "Solicite um link privado para gerenciar sua inscrição. Você poderá cancelar sem entrar em uma conta."}
        </p>
        {message ? (
          <p role="status" className="notice">
            {message}
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = token
                ? { token }
                : { email: new FormData(e.currentTarget).get("email") };
              setBusy(true);
              setError("");
              try {
                setMessage((await api("newsletter/" + action, data)).message);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {!token && (
              <label>
                Seu e-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="btn" disabled={busy}>
              {busy
                ? "Aplicando…"
                : unsubscribe
                  ? "CONFIRMAR DESCADASTRO"
                  : confirm
                    ? "CONFIRMAR INSCRIÇÃO"
                    : "SOLICITAR LINK DE PREFERÊNCIAS"}{" "}
              <ArrowUpRight size={17} />
            </button>
          </form>
        )}
        <Link className="text-button" href="/">
          Voltar para a loja ↗
        </Link>
        <Link className="text-button" href="/legal/privacidade">
          Política de privacidade
        </Link>
      </section>
    </div>
  );
}
