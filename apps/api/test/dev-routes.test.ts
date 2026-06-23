import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { resetConfigCache } from "../src/config.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";

const childBody = JSON.stringify({
  fullName: "Тест",
  iin: "123456789012",
  parentPhone: "+77010000000"
});

describe("dev routes gating", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    process.env.PUBLIC_APP_URL = "http://localhost:5173";
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    bootstrapDatabase(sqlite);
    db = createDb(sqlite);
  });

  afterEach(() => {
    delete process.env.ENABLE_DEV_ROUTES;
    resetConfigCache();
  });

  it("returns 404 for dev routes when the flag is unset", async () => {
    delete process.env.ENABLE_DEV_ROUTES;
    resetConfigCache();
    const app = createApp(db);
    const res = await app.request("/api/dev/children", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: childBody
    });
    expect(res.status).toBe(404);
  });

  it("mounts dev routes when ENABLE_DEV_ROUTES=true", async () => {
    process.env.ENABLE_DEV_ROUTES = "true";
    resetConfigCache();
    const app = createApp(db);
    const res = await app.request("/api/dev/children", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: childBody
    });
    expect(res.status).toBe(201);
  });
});
