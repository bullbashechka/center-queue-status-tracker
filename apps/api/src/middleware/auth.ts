import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";

import type { AppDb } from "../db/client.js";
import { getConfig } from "../config.js";
import { deleteEmployeeSession, getEmployeeSession } from "../domain/auth.js";
import type { AppEnv } from "../http.js";

export function createRequireEmployeeSession(db: AppDb): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const config = getConfig();
    const token = getCookie(c, config.SESSION_COOKIE_NAME);
    const employee = await getEmployeeSession(db, token, config.SESSION_SECRET);

    if (!employee) {
      await deleteEmployeeSession(db, token, config.SESSION_SECRET);
      clearEmployeeSessionCookie(c);
      return c.json({ message: "Требуется вход в админку." }, 401);
    }

    c.set("employee", employee);
    await next();
  };
}

export function setEmployeeSessionCookie(c: Context<AppEnv>, token: string, expiresAt: string): void {
  const config = getConfig();
  setCookie(c, config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.PUBLIC_APP_URL.startsWith("https://"),
    path: "/",
    expires: new Date(expiresAt)
  });
}

export function clearEmployeeSessionCookie(c: Context<AppEnv>): void {
  const config = getConfig();
  setCookie(c, config.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.PUBLIC_APP_URL.startsWith("https://"),
    path: "/",
    maxAge: 0
  });
}
