import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import {
  fetchCurrentEmployee,
  logoutEmployee,
  UnauthorizedError,
  type EmployeeSession
} from "../lib/api.js";

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadSession() {
      try {
        const currentEmployee = await fetchCurrentEmployee();

        if (!isCancelled) {
          setEmployee(currentEmployee);
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
            : "Не удалось проверить сессию сотрудника."
        );
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isCancelled = true;
    };
  }, [location.pathname, location.search, navigate]);

  async function handleLogout() {
    setIsLoggingOut(true);

    try {
      await logoutEmployee();
    } finally {
      navigate("/admin/login", { replace: true });
    }
  }

  if (isLoading) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Проверяем доступ</h1>
          <p>Загружаем сессию сотрудника.</p>
        </section>
      </main>
    );
  }

  if (!employee) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Сессия недоступна</h1>
          <p>{error ?? "Не удалось открыть админку."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell admin-shell">
      <header className="admin-topbar">
        <div>
          <div className="eyebrow">Внутренняя зона центра</div>
          <h1>Управление очередью</h1>
          <p className="admin-subtitle">{employee.displayName}</p>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={handleLogout}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? "Выходим..." : "Выйти"}
        </button>
      </header>

      <Outlet context={{ employee }} />
    </main>
  );
}
