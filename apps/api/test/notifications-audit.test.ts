import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";
import { upsertEmployee } from "../src/domain/auth.js";

describe("notifications stub and audit log", () => {
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

    await upsertEmployee(db, {
      login: "admin",
      displayName: "Администратор",
      password: "password123"
    });
  });

  it("keeps a single queue-advance notification per day with the latest position", async () => {
    const cookie = await login(app);

    const a = await createChild(app, cookie, "Первый Ребёнок", "123456789012");
    const b = await createChild(app, cookie, "Второй Ребёнок", "123456789013");
    const c = await createChild(app, cookie, "Третий Ребёнок", "123456789014");
    expect(c.queuePosition).toBe(3);

    // Первое движение: зачисление A сдвигает C с позиции 3 на 2.
    await enroll(app, cookie, a.id);
    // Второе движение в тот же день: зачисление B сдвигает C с 2 на 1.
    await enroll(app, cookie, b.id);

    const events = sqlite
      .prepare(
        `select payload_json as payloadJson
         from notification_events
         where child_id = ? and event_type = 'queue_position_changed'`
      )
      .all(c.id) as Array<{ payloadJson: string }>;

    // Несмотря на несколько сдвигов за день — ровно одна актуальная запись.
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]!.payloadJson) as { nextPosition: number };
    expect(payload.nextPosition).toBe(1);
  });

  it("returns a rendered audit history for a child", async () => {
    const cookie = await login(app);
    const child = await createChild(app, cookie, "Первый Ребёнок", "123456789012");

    await changeStatus(app, cookie, child.id, "diagnostics_passed", child.updatedAt);

    const response = await app.request(`/api/admin/children/${child.id}/audit`, {
      headers: { Cookie: cookie }
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Array<{ actionLabel: string; details: string | null; employeeName: string | null; createdAtLabel: string }>;
    };

    const labels = body.items.map((item) => item.actionLabel);
    expect(labels).toContain("Статус изменён");
    expect(labels).toContain("Ребёнок добавлен");

    const statusEvent = body.items.find((item) => item.actionLabel === "Статус изменён");
    expect(statusEvent?.details).toBe("Документы приняты → Диагностика пройдена");
    expect(statusEvent?.employeeName).toBe("Администратор");
    expect(statusEvent?.createdAtLabel).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it("returns 404 for an unknown child audit", async () => {
    const cookie = await login(app);
    const response = await app.request("/api/admin/children/9999/audit", {
      headers: { Cookie: cookie }
    });

    expect(response.status).toBe(404);
  });

  it("requires a session for the audit endpoint", async () => {
    const response = await app.request("/api/admin/children/1/audit");
    expect(response.status).toBe(401);
  });
});

type CreatedChild = { id: number; updatedAt: string; queuePosition: number | null };

async function createChild(
  app: ReturnType<typeof createApp>,
  cookie: string,
  fullName: string,
  iin: string
): Promise<CreatedChild> {
  const response = await app.request("/api/admin/children", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, iin, parentPhone: "+7 (701) 000-00-00" })
  });

  expect(response.status).toBe(201);
  return (await response.json()) as CreatedChild;
}

async function changeStatus(
  app: ReturnType<typeof createApp>,
  cookie: string,
  childId: number,
  status: string,
  expectedUpdatedAt: string
): Promise<CreatedChild> {
  const response = await app.request(`/api/admin/children/${childId}/status`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status, expectedUpdatedAt })
  });

  expect(response.status).toBe(200);
  return (await response.json()) as CreatedChild;
}

async function enroll(
  app: ReturnType<typeof createApp>,
  cookie: string,
  childId: number
): Promise<void> {
  let current = await changeStatus(app, cookie, childId, "diagnostics_passed", await currentUpdatedAt(app, cookie, childId));
  current = await changeStatus(app, cookie, childId, "waiting_for_enrollment", current.updatedAt);
  await changeStatus(app, cookie, childId, "enrolled", current.updatedAt);
}

async function currentUpdatedAt(
  app: ReturnType<typeof createApp>,
  cookie: string,
  childId: number
): Promise<string> {
  const response = await app.request(`/api/admin/children/${childId}`, {
    headers: { Cookie: cookie }
  });

  expect(response.status).toBe(200);
  return ((await response.json()) as CreatedChild).updatedAt;
}

async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "admin", password: "password123" })
  });

  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
