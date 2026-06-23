import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { isValidIin } from "@queue-tracker/shared";

import { getPublicStatusByIin, getPublicStatusByToken } from "../domain/children.js";
import { checkAndRecordSearchAttempt } from "../domain/searchRateLimit.js";
import { getClientIp } from "../lib/clientIp.js";
import { generatePublicToken } from "../lib/token.js";
import { getConfig } from "../config.js";
import type { AppDb } from "../db/client.js";
import type { AppEnv } from "../http.js";
import type { Context } from "hono";

const notFoundMessage = "Заявка не найдена или ссылка недействительна";
const searchNotFoundMessage = "Заявка не найдена";
const invalidIinMessage = "Введите ИИН из 12 цифр.";
const deviceCookieName = "queue_search_device";
const deviceCookieMaxAge = 60 * 60 * 24 * 365;

export function registerPublicRoutes(app: Hono<AppEnv>, db: AppDb) {
  app.get("/api/public/status/:token", async (c) => {
    const token = c.req.param("token");
    const status = await getPublicStatusByToken(db, token);

    if (!status) {
      return c.json({ message: notFoundMessage }, 404);
    }

    return c.json(status);
  });

  app.get("/api/public/search", async (c) => {
    const iin = c.req.query("iin") ?? "";

    // Формат проверяем до лимита: опечатки не должны жечь попытки.
    if (!isValidIin(iin)) {
      return c.json({ message: invalidIinMessage }, 400);
    }

    const deviceId = ensureDeviceId(c);
    const ip = getClientIp(c);

    const limit = checkAndRecordSearchAttempt(db, { deviceId, ip });
    if (!limit.allowed) {
      const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json(
        {
          message: `Слишком много попыток поиска. Попробуйте через ~${minutes} мин. или откройте персональную ссылку из сообщения.`
        },
        429
      );
    }

    const status = await getPublicStatusByIin(db, iin);
    if (!status) {
      return c.json({ message: searchNotFoundMessage }, 404);
    }

    return c.json({ token: status.token });
  });
}

function ensureDeviceId(c: Context<AppEnv>): string {
  const existing = getCookie(c, deviceCookieName);
  if (existing) {
    return existing;
  }

  const config = getConfig();
  const deviceId = generatePublicToken();
  setCookie(c, deviceCookieName, deviceId, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.PUBLIC_APP_URL.startsWith("https://"),
    path: "/",
    maxAge: deviceCookieMaxAge
  });

  return deviceId;
}
