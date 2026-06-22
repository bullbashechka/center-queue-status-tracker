import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PublicStatusView } from "@queue-tracker/shared";

import { StatusCard } from "../components/StatusCard.js";
import { ApiRequestError, fetchStatusByToken } from "../lib/api.js";

type StatusPageState =
  | { type: "loading" }
  | { type: "loaded"; status: PublicStatusView }
  | { type: "notFound"; message: string }
  | { type: "technicalError"; message: string };

const notFoundMessage = "Статус недоступен. Проверьте ссылку или воспользуйтесь поиском по ИИН.";
const technicalErrorMessage = "Не удалось загрузить данные. Проверьте интернет и попробуйте снова.";

export function StatusPage() {
  const { token = "" } = useParams();
  const [pageState, setPageState] = useState<StatusPageState>({ type: "loading" });
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPageState({ type: "loading" });

      try {
        const result = await fetchStatusByToken(token);

        if (!cancelled) {
          setPageState({ type: "loaded", status: result });
        }
      } catch (requestError) {
        if (!cancelled) {
          if (requestError instanceof ApiRequestError && requestError.status === 404) {
            setPageState({ type: "notFound", message: notFoundMessage });
            return;
          }

          setPageState({ type: "technicalError", message: technicalErrorMessage });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [retryKey, token]);

  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Страница статуса</div>
        <h1>Актуальная информация по очереди</h1>
        <p>Данные обновляются при каждом открытии страницы и показывают текущее состояние заявки.</p>
      </section>

      {pageState.type === "loaded" ? (
        <StatusCard status={pageState.status} />
      ) : (
        <section className="panel">
          {pageState.type === "loading" ? (
            <>
              <h2>Загружаем статус...</h2>
              <p className="panel-note">Проверяем актуальные данные по вашей ссылке.</p>
            </>
          ) : pageState.type === "technicalError" ? (
            <>
              <h2>Не удалось загрузить данные</h2>
              <p className="panel-note">{pageState.message}</p>
              <button
                className="ghost-button status-retry-button"
                type="button"
                onClick={() => setRetryKey((key) => key + 1)}
              >
                Повторить
              </button>
            </>
          ) : (
            <>
              <h2>Статус недоступен</h2>
              <p className="panel-note">{pageState.message}</p>
              <Link className="inline-link" to="/search">
                Перейти к поиску по ИИН
              </Link>
            </>
          )}
        </section>
      )}
    </main>
  );
}
