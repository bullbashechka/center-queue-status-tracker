import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  fetchCurrentEmployee,
  loginEmployee,
  UnauthorizedError
} from "../lib/api.js";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    async function checkSession() {
      try {
        await fetchCurrentEmployee();

        if (!isCancelled) {
          navigate(searchParams.get("next") || "/admin", { replace: true });
        }
      } catch (requestError) {
        if (!isCancelled && !(requestError instanceof UnauthorizedError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось открыть форму входа."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsCheckingSession(false);
        }
      }
    }

    void checkSession();

    return () => {
      isCancelled = true;
    };
  }, [navigate, searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await loginEmployee({ login, password });
      navigate(searchParams.get("next") || "/admin", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось войти в админку.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingSession) {
    return (
      <main className="shell">
        <section className="panel">
          <h1>Проверяем доступ</h1>
          <p>Открываем форму входа для сотрудника.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell admin-auth-shell">
      <section className="hero hero-search">
        <div className="eyebrow">Админка</div>
        <h1>Вход сотрудников</h1>
        <p>Используйте логин и пароль, выданные на этапе настройки системы.</p>
      </section>

      <section className="panel form-panel admin-auth-panel">
        <form onSubmit={handleSubmit} className="search-form">
          <label htmlFor="login">Логин</label>
          <input
            id="login"
            name="login"
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
          />

          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <button type="submit" disabled={isLoading}>
            {isLoading ? "Входим..." : "Войти"}
          </button>
        </form>

        <p className={`message${error ? " message--visible" : ""}`}>{error ?? " "}</p>
      </section>
    </main>
  );
}
