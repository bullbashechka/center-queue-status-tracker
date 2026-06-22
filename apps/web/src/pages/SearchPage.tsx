import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { searchStatusByIin } from "../lib/api.js";

export function SearchPage() {
  const navigate = useNavigate();
  const [iin, setIin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const result = await searchStatusByIin(iin);
      navigate(`/status/${result.token}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось выполнить поиск.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
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

        <p className={`message${message ? " message--visible" : ""}`}>{message ?? " "}</p>
      </section>
    </main>
  );
}
