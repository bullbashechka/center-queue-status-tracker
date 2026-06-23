import { childStatusLabels, childStatusValues } from "@queue-tracker/shared";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  fetchAdminChildren,
  UnauthorizedError,
  type AdminChildListItem
} from "../lib/api.js";

export function AdminListPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "enrolled" ? "enrolled" : "queue";
  const status = searchParams.get("status") ?? "";
  const query = searchParams.get("query") ?? "";
  const [draftQuery, setDraftQuery] = useState(query);
  const [items, setItems] = useState<AdminChildListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    let isCancelled = false;

    async function loadChildren() {
      setIsLoading(true);

      try {
        const nextItems = await fetchAdminChildren({ mode, status, query });

        if (!isCancelled) {
          setItems(nextItems);
          setError(null);
        }
      } catch (requestError) {
        if (isCancelled) {
          return;
        }

        if (requestError instanceof UnauthorizedError) {
          const nextPath = `${location.pathname}${location.search}`;
          navigate(`/admin/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
          return;
        }

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить список детей."
        );
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadChildren();

    return () => {
      isCancelled = true;
    };
  }, [location.pathname, location.search, mode, navigate, query, status]);

  function updateParams(nextValues: { mode?: string; status?: string; query?: string }) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextValues.mode !== undefined) {
      nextParams.set("mode", nextValues.mode);
    }

    if (nextValues.status !== undefined) {
      if (nextValues.status) {
        nextParams.set("status", nextValues.status);
      } else {
        nextParams.delete("status");
      }
    }

    if (nextValues.query !== undefined) {
      if (nextValues.query.trim()) {
        nextParams.set("query", nextValues.query.trim());
      } else {
        nextParams.delete("query");
      }
    }

    setSearchParams(nextParams, { replace: true });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ query: draftQuery });
  }

  return (
    <section className="admin-page">
      <section className="panel admin-toolbar">
        <div className="admin-toolbar-row">
          <div className="segment-control">
            <button
              type="button"
              className={mode === "queue" ? "segment-button segment-button--active" : "segment-button"}
              onClick={() => updateParams({ mode: "queue" })}
            >
              В очереди
            </button>
            <button
              type="button"
              className={mode === "enrolled" ? "segment-button segment-button--active" : "segment-button"}
              onClick={() => updateParams({ mode: "enrolled" })}
            >
              Зачисленные
            </button>
          </div>

          <Link className="accent-button" to="/admin/children/new">
            Добавить ребёнка
          </Link>
        </div>

        <form className="admin-filters" onSubmit={handleSearchSubmit}>
          <input
            type="search"
            value={draftQuery}
            placeholder="Поиск по ФИО, ИИН или телефону"
            onChange={(event) => setDraftQuery(event.target.value)}
          />

          <select
            value={status}
            onChange={(event) => updateParams({ status: event.target.value })}
          >
            <option value="">Все статусы</option>
            {childStatusValues
              .filter((value) => (mode === "queue" ? value !== "enrolled" : value === "enrolled"))
              .map((value) => (
                <option key={value} value={value}>
                  {childStatusLabels[value]}
                </option>
              ))}
          </select>

          <button type="submit">Найти</button>
        </form>
      </section>

      {error ? (
        <section className="panel">
          <h2>Список недоступен</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {isLoading ? (
        <section className="panel">
          <h2>Загружаем список</h2>
          <p>Получаем актуальные данные очереди.</p>
        </section>
      ) : items.length === 0 ? (
        <section className="panel empty-state">
          {query || status ? (
            <>
              <h2>Ничего не найдено</h2>
              <p>Проверьте ФИО, ИИН или телефон и измените фильтр.</p>
            </>
          ) : (
            <>
              <h2>В очереди пока нет детей</h2>
              <p>Добавьте первого ребёнка, чтобы начать вести очередь.</p>
              <Link className="accent-button" to="/admin/children/new">
                Добавить ребёнка
              </Link>
            </>
          )}
        </section>
      ) : (
        <section className="admin-list">
          {items.map((item) => (
            <article key={item.id} className="panel admin-list-card">
              <div className="admin-list-card__head">
                <div>
                  <div className="eyebrow">{item.statusLabel}</div>
                  <h2>{item.fullName}</h2>
                </div>
                <Link className="inline-link" to={`/admin/children/${item.id}${location.search}`}>
                  Открыть карточку
                </Link>
              </div>

              <dl className="admin-metrics">
                <div>
                  <dt>ИИН</dt>
                  <dd>{item.iin}</dd>
                </div>
                <div>
                  <dt>Телефон</dt>
                  <dd>{item.parentPhone}</dd>
                </div>
                <div>
                  <dt>Номер в очереди</dt>
                  <dd>{item.queuePosition ?? "Не участвует"}</dd>
                </div>
                <div>
                  <dt>Семей впереди</dt>
                  <dd>{item.familiesAhead ?? "Не участвует"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
