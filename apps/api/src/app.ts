import { cors } from "hono/cors";
import { Hono } from "hono";

import type { AppDb } from "./db/client.js";
import { getConfig } from "./config.js";
import { registerDevRoutes } from "./routes/dev.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPublicRoutes } from "./routes/public.js";

export function createApp(db: AppDb) {
  const config = getConfig();
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      origin: config.PUBLIC_APP_URL
    })
  );

  registerHealthRoutes(app);
  registerPublicRoutes(app, db);
  registerDevRoutes(app, db);

  app.notFound((c) => c.json({ message: "Маршрут не найден" }, 404));

  app.onError((error, c) => {
    console.error(error);
    return c.json({ message: "Внутренняя ошибка сервера" }, 500);
  });

  return app;
}
