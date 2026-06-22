import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="shell">
      <section className="panel not-found">
        <div className="eyebrow">404</div>
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или вернитесь на публичный поиск статуса.</p>
        <Link className="inline-link" to="/search">
          Открыть поиск
        </Link>
      </section>
    </main>
  );
}

