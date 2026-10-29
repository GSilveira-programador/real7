export default function Loading() {
  return (
    <main className="container loading" aria-label="Carregando loja">
      <div className="skeleton" style={{ height: 70 }} />
      <div className="skeleton" style={{ height: 450, marginTop: 30 }} />
      <p>Preparando seu próximo jogo…</p>
    </main>
  );
}
