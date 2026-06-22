import type { Hono } from "hono";

import type { AppEnv } from "../http.js";

export function registerHealthRoutes(app: Hono<AppEnv>) {
  app.get("/health", (c) =>
    c.json({
      status: "ok"
    })
  );
}
