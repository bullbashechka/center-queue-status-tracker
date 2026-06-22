import { childStatusLabels, childStatusValues, type ChildStatus } from "@queue-tracker/shared";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import {
  archiveAdminChild,
  buildPublicStatusUrl,
  changeAdminChildStatus,
  createAdminChild,
  fetchAdminChild,
  fetchAdminChildAudit,
  UnauthorizedError,
  updateAdminChild,
  type AdminChildDetail,
  type AuditEventView
} from "../lib/api.js";

type ChildFormState = {
  fullName: string;
  iin: string;
  parentPhone: string;
  estimatedStartText: string;
};

const emptyForm: ChildFormState = {
  fullName: "",
  iin: "",
  parentPhone: "",
  estimatedStartText: ""
};

export function AdminChildPage() {
  const { childId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isCreateMode = !childId;
  const [child, setChild] = useState<AdminChildDetail | null>(null);
  const [form, setForm] = useState<ChildFormState>(emptyForm);
  const [rollbackStatus, setRollbackStatus] = useState<ChildStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!isCreateMode);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"card" | "history">("card");
  const [auditItems, setAuditItems] = useState<AuditEventView[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);

  useEffect(() => {
    if (isCreateMode) {
      setChild(null);
      setForm(emptyForm);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadChild() {
      setIsLoading(true);

      try {
        const nextChild = await fetchAdminChild(Number(childId));

        if (!isCancelled) {
          setChild(nextChild);
          setForm({
            fullName: nextChild.fullName,
            iin: nextChild.iin,
            parentPhone: nextChild.parentPhone,
            estimatedStartText: nextChild.estimatedStartText ?? ""
          });
          setRollbackStatus("");
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
            : "Не удалось загрузить карточку ребёнка."
        );
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadChild();

    return () => {
      isCancelled = true;
    };
  }, [childId, isCreateMode, location.pathname, location.search, navigate]);

  useEffect(() => {
    setAuditLoaded(false);
    setAuditItems([]);
    setAuditError(null);
  }, [childId]);

  useEffect(() => {
    if (activeTab !== "history" || isCreateMode || !childId || auditLoaded) {
      return;
    }

    let isCancelled = false;

    async function loadAudit() {
      setIsAuditLoading(true);
      setAuditError(null);

      try {
        const items = await fetchAdminChildAudit(Number(childId));

        if (!isCancelled) {
          setAuditItems(items);
          setAuditLoaded(true);
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

        setAuditError(
          requestError instanceof Error ? requestError.message : "Не удалось загрузить историю."
        );
      } finally {
        if (!isCancelled) {
          setIsAuditLoading(false);
        }
      }
    }

    void loadAudit();

    return () => {
      isCancelled = true;
    };
  }, [activeTab, auditLoaded, childId, isCreateMode, location.pathname, location.search, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (isCreateMode) {
        const created = await createAdminChild(form);
        navigate(`/admin/children/${created.id}${location.search}`, { replace: true });
        return;
      }

      if (!child) {
        throw new Error("Карточка ещё не загружена.");
      }

      if (
        child.iin !== form.iin &&
        !window.confirm(
          "После изменения ИИН родитель сможет найти заявку только по новому ИИН. Продолжить?"
        )
      ) {
        return;
      }

      const updated = await updateAdminChild(child.id, {
        ...form,
        expectedUpdatedAt: child.updatedAt
      });

      setChild(updated);
      setForm({
        fullName: updated.fullName,
        iin: updated.iin,
        parentPhone: updated.parentPhone,
        estimatedStartText: updated.estimatedStartText ?? ""
      });
      setAuditLoaded(false);
    } catch (requestError) {
      if (requestError instanceof UnauthorizedError) {
        const nextPath = `${location.pathname}${location.search}`;
        navigate(`/admin/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
        return;
      }

      setError(
        requestError instanceof Error ? requestError.message : "Не удалось сохранить данные ребёнка."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    if (!child) {
      return;
    }

    const isConfirmed = window.confirm(
      "Запись уйдёт в архив. Родитель больше не сможет открыть статус по старой ссылке или найти его по ИИН."
    );

    if (!isConfirmed) {
      return;
    }

    const archiveReason = window.prompt("Причина архивирования (необязательно):", "") ?? "";
    setIsSaving(true);
    setError(null);

    try {
      await archiveAdminChild({
        childId: child.id,
        expectedUpdatedAt: child.updatedAt,
        archiveReason
      });
      navigate(`/admin${location.search}`, { replace: true });
    } catch (requestError) {
      if (requestError instanceof UnauthorizedError) {
        const nextPath = `${location.pathname}${location.search}`;
        navigate(`/admin/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
        return;
      }

      setError(requestError instanceof Error ? requestError.message : "Не удалось архивировать запись.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(nextStatus: ChildStatus) {
    if (!child) {
      return;
    }

    const nextIndex = childStatusValues.indexOf(nextStatus);
    const currentIndex = childStatusValues.indexOf(child.status);
    const isBackward = nextIndex < currentIndex;
    const isEnrolledTransition = nextStatus === "enrolled";

    if (isEnrolledTransition) {
      const confirmed = window.confirm(
        "После зачисления ребёнок выйдет из активной очереди, а позиции остальных детей изменятся. Продолжить?"
      );

      if (!confirmed) {
        return;
      }
    }

    if (isBackward) {
      const message =
        child.status === "enrolled"
          ? "Ребёнок вернётся в активную очередь по исходной дате постановки. Позиции других детей могут измениться. Продолжить?"
          : "Подтвердите откат на более ранний статус.";

      if (!window.confirm(message)) {
        return;
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await changeAdminChildStatus({
        childId: child.id,
        status: nextStatus,
        expectedUpdatedAt: child.updatedAt
      });

      setChild(updated);
      setForm({
        fullName: updated.fullName,
        iin: updated.iin,
        parentPhone: updated.parentPhone,
        estimatedStartText: updated.estimatedStartText ?? ""
      });
      setRollbackStatus("");
      setAuditLoaded(false);
    } catch (requestError) {
      if (requestError instanceof UnauthorizedError) {
        const nextPath = `${location.pathname}${location.search}`;
        navigate(`/admin/login?next=${encodeURIComponent(nextPath)}`, { replace: true });
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось изменить статус ребёнка."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCopy(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(successMessage);
      window.setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("Не удалось скопировать текст.");
    }
  }

  const earlierStatuses = child
    ? childStatusValues.filter(
        (status) => childStatusValues.indexOf(status) < childStatusValues.indexOf(child.status)
      )
    : [];
  const nextStatus = child
    ? childStatusValues[childStatusValues.indexOf(child.status) + 1] ?? null
    : null;

  if (isLoading) {
    return (
      <section className="panel">
        <h2>Загружаем карточку</h2>
        <p>Получаем актуальные данные ребёнка.</p>
      </section>
    );
  }

  return (
    <section className="admin-detail-page">
      <div className="admin-detail-header">
        <Link className="inline-link" to={`/admin${location.search}`}>
          Вернуться к списку
        </Link>
      </div>

      {error ? (
        <section className="panel">
          <h2>Действие не выполнено</h2>
          <p>{error}</p>
        </section>
      ) : null}

      {!isCreateMode ? (
        <div className="admin-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "card"}
            className={`admin-tab${activeTab === "card" ? " admin-tab--active" : ""}`}
            onClick={() => setActiveTab("card")}
          >
            Карточка
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            className={`admin-tab${activeTab === "history" ? " admin-tab--active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            История
          </button>
        </div>
      ) : null}

      {activeTab === "history" && !isCreateMode ? (
        <section className="panel">
          <div className="eyebrow">Журнал действий</div>
          <h2>История изменений</h2>

          {isAuditLoading ? <p>Загружаем историю...</p> : null}
          {auditError ? <p>{auditError}</p> : null}

          {!isAuditLoading && !auditError && auditItems.length === 0 ? (
            <p>Действий пока нет.</p>
          ) : null}

          {!isAuditLoading && !auditError && auditItems.length > 0 ? (
            <ul className="admin-audit-list">
              {auditItems.map((item) => (
                <li key={item.id} className="admin-audit-item">
                  <strong>{item.actionLabel}</strong>
                  <span className="admin-audit-meta">
                    {item.createdAtLabel} · {item.employeeName ?? "—"}
                  </span>
                  {item.details ? <span className="admin-audit-details">{item.details}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="admin-detail-grid" hidden={activeTab !== "card" && !isCreateMode}>
        <section className="panel">
          <div className="eyebrow">{isCreateMode ? "Новая запись" : "Карточка ребёнка"}</div>
          <h2>{isCreateMode ? "Добавить ребёнка" : child?.fullName}</h2>

          <form className="admin-form" onSubmit={handleSubmit}>
            <label htmlFor="fullName">ФИО ребёнка</label>
            <input
              id="fullName"
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
            />

            <label htmlFor="iin">ИИН</label>
            <input
              id="iin"
              inputMode="numeric"
              value={form.iin}
              onChange={(event) => setForm((current) => ({ ...current, iin: event.target.value }))}
            />

            <label htmlFor="parentPhone">Телефон родителя</label>
            <input
              id="parentPhone"
              inputMode="tel"
              value={form.parentPhone}
              onChange={(event) =>
                setForm((current) => ({ ...current, parentPhone: event.target.value }))
              }
            />

            <label htmlFor="estimatedStartText">Ориентировочный срок</label>
            <input
              id="estimatedStartText"
              value={form.estimatedStartText}
              placeholder="Например, август-сентябрь 2026 года"
              onChange={(event) =>
                setForm((current) => ({ ...current, estimatedStartText: event.target.value }))
              }
            />

            <button type="submit" className="accent-button" disabled={isSaving}>
              {isSaving ? "Сохраняем..." : isCreateMode ? "Создать запись" : "Сохранить изменения"}
            </button>
          </form>
        </section>

        {!isCreateMode && child ? (
          <section className="panel">
            <div className="eyebrow">Статус и действия</div>
            <h2>{child.statusLabel}</h2>

            <dl className="admin-metrics">
              <div>
                <dt>Номер в очереди</dt>
                <dd>{child.queuePosition ?? "Не участвует"}</dd>
              </div>
              <div>
                <dt>Семей впереди</dt>
                <dd>{child.familiesAhead ?? "Не участвует"}</dd>
              </div>
            </dl>

            <div className="admin-actions-stack">
              {nextStatus ? (
                <button
                  type="button"
                  className="accent-button"
                  disabled={isSaving}
                  onClick={() => void handleStatusChange(nextStatus)}
                >
                  Перевести в «{childStatusLabels[nextStatus]}»
                </button>
              ) : null}

              {earlierStatuses.length > 0 ? (
                <div className="rollback-box">
                  <select
                    value={rollbackStatus}
                    onChange={(event) => setRollbackStatus(event.target.value as ChildStatus | "")}
                  >
                    <option value="">Выберите статус для отката</option>
                    {earlierStatuses.map((status) => (
                      <option key={status} value={status}>
                        {childStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!rollbackStatus || isSaving}
                    onClick={() => rollbackStatus && void handleStatusChange(rollbackStatus)}
                  >
                    Откатить статус
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="ghost-button ghost-button--danger"
                disabled={isSaving}
                onClick={() => void handleArchive()}
              >
                Архивировать запись
              </button>
            </div>
          </section>
        ) : null}

        {!isCreateMode && child ? (
          <section className="panel admin-side-panel">
            <div className="eyebrow">Ссылка и сообщение</div>
            <h2>Публичный доступ</h2>

            <div className="admin-link-box">
              <span>{buildPublicStatusUrl(child.token)}</span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void handleCopy(buildPublicStatusUrl(child.token), "Ссылка скопирована.")}
              >
                Скопировать ссылку
              </button>
            </div>

            <label className="admin-message-label" htmlFor="lastMessage">
              Последний подготовленный текст
            </label>
            <textarea
              id="lastMessage"
              readOnly
              value={child.lastNotificationMessage ?? "Сообщение пока не подготовлено."}
            />

            <button
              type="button"
              className="ghost-button"
              disabled={!child.lastNotificationMessage}
              onClick={() =>
                child.lastNotificationMessage &&
                void handleCopy(child.lastNotificationMessage, "Текст сообщения скопирован.")
              }
            >
              Скопировать текст сообщения
            </button>

            <p className="admin-message-hint">
              Сообщения о продвижении очереди отправляйте после 18:00.
            </p>

            <p className={`message${copyMessage ? " message--visible" : ""}`}>{copyMessage ?? " "}</p>
          </section>
        ) : null}
      </div>
    </section>
  );
}
