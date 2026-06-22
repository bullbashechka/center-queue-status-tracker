import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";
import { createChild } from "../src/domain/children.js";

const validIin = "123456789012";
const deviceCookieName = "queue_search_device";

function readDeviceCookie(response: Response): string | undefined {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    return undefined;
  }
  const match = setCookie.match(new RegExp(`${deviceCookieName}=([^;]+)`));
  return match?.[1];
}

describe("public IIN search rate limiting", () => {
  let sqlite: DatabaseSync;
  let db: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    process.env.PUBLIC_APP_URL = "http://localhost:5173";
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    bootstrapDatabase(sqlite);
    db = createDb(sqlite);
    app = createApp(db);

    await createChild(db, {
      fullName: "Ребёнок",
      iin: validIin,
      parentPhone: "+77010000000"
    });
  });

  function search(options: { device?: string; ip?: string } = {}) {
    const headers: Record<string, string> = {};
    if (options.device) {
      headers["Cookie"] = `${deviceCookieName}=${options.device}`;
    }
    if (options.ip) {
      headers["x-forwarded-for"] = options.ip;
    }
    return app.request(`/api/public/search?iin=${validIin}`, { headers });
  }

  it("returns only the token on a successful search", async () => {
    const response = await search({ ip: "10.0.0.1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: expect.any(String) });
  });

  it("blocks the device after 5 attempts in the window", async () => {
    // Берём device-cookie из первого ответа и переиспользуем его.
    const first = await search({ ip: "10.0.0.1" });
    const device = readDeviceCookie(first);
    expect(device).toBeDefined();

    for (let i = 0; i < 4; i += 1) {
      const ok = await search({ device, ip: "10.0.0.1" });
      expect(ok.status).toBe(200);
    }

    const blocked = await search({ device, ip: "10.0.0.1" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const body = (await blocked.json()) as { message: string };
    expect(body.message).toContain("персональную ссылку");
  });

  it("does not count invalid-format attempts toward the limit", async () => {
    const device = "fixed-device-token";
    for (let i = 0; i < 10; i += 1) {
      const invalid = await app.request("/api/public/search?iin=123", {
        headers: { Cookie: `${deviceCookieName}=${device}`, "x-forwarded-for": "10.0.0.1" }
      });
      expect(invalid.status).toBe(400);
    }

    const ok = await search({ device, ip: "10.0.0.1" });
    expect(ok.status).toBe(200);
  });

  it("enforces the IP ceiling across different devices", async () => {
    const ip = "203.0.113.7";
    for (let i = 0; i < 30; i += 1) {
      const ok = await search({ device: `device-${i}`, ip });
      expect(ok.status).toBe(200);
    }

    const blocked = await search({ device: "device-extra", ip });
    expect(blocked.status).toBe(429);
  });

  it("ignores attempts older than the 15-minute window", async () => {
    const device = "windowed-device";
    const oldTimestamp = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const insert = db.sqlite.prepare(
      "insert into search_attempts (device_id, ip_address, created_at) values (?, ?, ?)"
    );
    for (let i = 0; i < 5; i += 1) {
      insert.run(device, "10.0.0.1", oldTimestamp);
    }

    const ok = await search({ device, ip: "10.0.0.1" });
    expect(ok.status).toBe(200);
  });
});
