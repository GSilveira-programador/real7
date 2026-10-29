"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="container empty">
      <h1>Não foi possível carregar a loja.</h1>
      <p>Verifique sua conexão e tente novamente.</p>
      <button className="btn" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
