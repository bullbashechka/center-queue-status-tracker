import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PublicStatusView } from "@queue-tracker/shared";

import { StatusCard } from "../components/StatusCard.js";
import { fetchStatusByToken } from "../lib/api.js";

export function StatusPage() {
  const { token = "" } = useParams();
  const [status, setStatus] = useState<PublicStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await fetchStatusByToken(token);

        if (!cancelled) {
          setStatus(result);
          setError(null);
        }
      } catch (requestError) {
        if (!cancelled) {
          setStatus(null);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Заявка не найдена или ссылка недействительна"
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Страница статуса</div>
        <h1>Актуальная информация по очереди</h1>
        <p>Данные обновляются при каждом открытии страницы и показывают текущее состояние заявки.</p>
      </section>

      {status ? (
        <StatusCard status={status} />
      ) : (
        <section className="panel">
          <h2>Статус недоступен</h2>
          <p>{error ?? "Загрузка..."}</p>
          <Link className="inline-link" to="/search">
            Вернуться к поиску по ИИН
          </Link>
        </section>
      )}
    </main>
  );
}

