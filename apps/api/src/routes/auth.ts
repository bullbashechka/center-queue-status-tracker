import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { ZodError } from "zod";

import { getConfig } from "../config.js";
import {
  authenticateEmployee,
  createEmployeeSession,
  deleteEmployeeSession,
  getEmployeeSession,
  InvalidCredentialsError
} from "../domain/auth.js";
import type { AppDb } from "../db/client.js";
import type { AppEnv } from "../http.js";
import { clearEmployeeSessionCookie, setEmployeeSessionCookie } from "../middleware/auth.js";

export function registerAuthRoutes(app: Hono<AppEnv>, db: AppDb) {
  app.post("/api/auth/login", async (c) => {
    const body = await c.req.json().catch(() => ({}));

    try {
      const employee = await authenticateEmployee(db, body);
      const session = await createEmployeeSession(db, employee, getConfig().SESSION_SECRET);
      setEmployeeSessionCookie(c, session.token, session.expiresAt);
      return c.json(employee);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        clearEmployeeSessionCookie(c);
        return c.json({ message: error.message }, 401);
      }

      if (error instanceof ZodError) {
        return c.json({ message: error.issues[0]?.message ?? "Проверьте данные для входа." }, 400);
      }

      throw error;
    }
  });

  app.get("/api/auth/me", async (c) => {
    const config = getConfig();
    const token = getCookie(c, config.SESSION_COOKIE_NAME);
    const employee = await getEmployeeSession(db, token, config.SESSION_SECRET);

    if (!employee) {
      await deleteEmployeeSession(db, token, config.SESSION_SECRET);
      clearEmployeeSessionCookie(c);
      return c.json({ message: "Сессия истекла. Войдите снова." }, 401);
    }

    return c.json(employee);
  });

  app.post("/api/auth/logout", async (c) => {
    const config = getConfig();
    const token = getCookie(c, config.SESSION_COOKIE_NAME);
    await deleteEmployeeSession(db, token, config.SESSION_SECRET);
    clearEmployeeSessionCookie(c);
    return c.json({ success: true });
  });
}
