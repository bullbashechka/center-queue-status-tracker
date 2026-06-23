import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { AdminEntryLink } from "../components/AdminEntryLink.js";
import { ApiRequestError, searchStatusByIin } from "../lib/api.js";

type SearchResult =
  | { kind: "idle" }
  | { kind: "notFound" }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

function ResultIcon({ kind }: { kind: "warning" | "danger" }) {
  return (
    <svg
      className={`result-icon result-icon--${kind}`}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "warning" ? (
        <path d="M12 4L3 19h18L12 4zM12 10v4M12 17v.5" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16v.5" />
        </>
      )}
    </svg>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [iin, setIin] = useState("");
  const [result, setResult] = useState<SearchResult>({ kind: "idle" });
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setResult({ kind: "idle" });

    try {
      const found = await searchStatusByIin(iin);
      navigate(`/status/${found.token}`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        setResult({ kind: "notFound" });
      } else if (error instanceof ApiRequestError && error.status === 429) {
        setResult({ kind: "blocked", message: error.message });
      } else if (error instanceof ApiRequestError && error.status === 400) {
        setResult({ kind: "error", message: error.message });
      } else {
        setResult({
          kind: "error",
          message: "Не удалось выполнить поиск. Проверьте интернет и попробуйте снова."
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <AdminEntryLink />
      <section className="hero hero-search">
        <div className="eyebrow">Публичный доступ</div>
        <h1>Проверьте статус ребёнка по ИИН</h1>
        <p>
          Введите ИИН ребёнка. Система покажет актуальный этап, номер в очереди и количество семей
          впереди.
        </p>
      </section>

      <section className="panel form-panel">
        <form onSubmit={handleSubmit} className="search-form">
          <label htmlFor="iin">ИИН ребёнка</label>
          <input
            id="iin"
            name="iin"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Например, 1234 5678 9012"
            value={iin}
            onChange={(event) => setIin(event.target.value)}
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Поиск..." : "Найти"}
          </button>
        </form>

        {result.kind === "notFound" ? (
          <div className="result-block result-block--warning" role="status">
            <ResultIcon kind="warning" />
            <div>
              <strong>Заявка не найдена</strong>
              <p>Проверьте ИИН ребёнка. Если он верный, заявки с таким ИИН в системе нет.</p>
            </div>
          </div>
        ) : result.kind === "blocked" ? (
          <div className="result-block result-block--warning" role="status">
            <ResultIcon kind="warning" />
            <div>
              <strong>Поиск временно ограничен</strong>
              <p>{result.message}</p>
            </div>
          </div>
        ) : result.kind === "error" ? (
          <div className="result-block result-block--danger" role="alert">
            <ResultIcon kind="danger" />
            <div>
              <strong>Не удалось выполнить поиск</strong>
              <p>{result.message}</p>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
