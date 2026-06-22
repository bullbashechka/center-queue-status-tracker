import type { Hono } from "hono";

export function registerHealthRoutes(app: Hono) {
  app.get("/health", (c) =>
    c.json({
      status: "ok"
    })
  );
}

