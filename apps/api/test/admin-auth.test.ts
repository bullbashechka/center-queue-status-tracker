import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";
import { upsertEmployee } from "../src/domain/auth.js";

describe("admin auth and routes", () => {
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

  it("requires a valid employee session for admin routes", async () => {
    const response = await app.request("/api/admin/children?mode=queue");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Требуется вход в админку." });
  });

  it("logs in, returns current employee, and logs out", async () => {
    const loginResponse = await app.request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        login: "admin",
        password: "password123"
      })
    });

    expect(loginResponse.status).toBe(200);
    expect(await loginResponse.json()).toMatchObject({
      login: "admin",
      displayName: "Администратор"
    });

    const cookie = getCookieHeader(loginResponse);
    const meResponse = await app.request("/api/auth/me", {
      headers: {
        Cookie: cookie
      }
    });

    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toMatchObject({
      login: "admin"
    });

    const logoutResponse = await app.request("/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie
      }
    });

    expect(logoutResponse.status).toBe(200);

    const afterLogoutResponse = await app.request("/api/auth/me", {
      headers: {
        Cookie: cookie
      }
    });

    expect(afterLogoutResponse.status).toBe(401);
  });

  it("supports admin CRUD, queue recalculation, and stale protection", async () => {
    const cookie = await login(app);

    const firstCreateResponse = await app.request("/api/admin/children", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Первый Ребёнок",
        iin: "123456789012",
        parentPhone: "+7 (701) 000-00-00",
        estimatedStartText: "Август 2026"
      })
    });

    expect(firstCreateResponse.status).toBe(201);
    const firstChild = (await firstCreateResponse.json()) as {
      id: number;
      updatedAt: string;
      queuePosition: number | null;
    };
    expect(firstChild.queuePosition).toBe(1);

    const secondCreateResponse = await app.request("/api/admin/children", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Второй Ребёнок",
        iin: "123456789013",
        parentPhone: "87010000001"
      })
    });

    const secondChild = (await secondCreateResponse.json()) as {
      id: number;
      updatedAt: string;
      queuePosition: number | null;
    };
    expect(secondChild.queuePosition).toBe(2);

    const staleUpdateResponse = await app.request(`/api/admin/children/${firstChild.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Первый Ребёнок",
        iin: "123456789012",
        parentPhone: "+77010000000",
        estimatedStartText: "Сентябрь 2026",
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z"
      })
    });

    expect(staleUpdateResponse.status).toBe(409);

    const updateResponse = await app.request(`/api/admin/children/${firstChild.id}`, {
      method: "PUT",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fullName: "Первый Ребёнок Обновлён",
        iin: "123456789012",
        parentPhone: "8 701 000 00 00",
        estimatedStartText: "Сентябрь 2026",
        expectedUpdatedAt: firstChild.updatedAt
      })
    });

    expect(updateResponse.status).toBe(200);
    const updatedFirstChild = (await updateResponse.json()) as {
      updatedAt: string;
      fullName: string;
    };
    expect(updatedFirstChild.fullName).toBe("Первый Ребёнок Обновлён");

    const searchResponse = await app.request("/api/admin/children?mode=queue&query=87010000000", {
      headers: {
        Cookie: cookie
      }
    });

    expect(searchResponse.status).toBe(200);
    const searchResult = (await searchResponse.json()) as {
      items: Array<{ id: number }>;
    };
    expect(searchResult.items).toHaveLength(1);
    expect(searchResult.items[0]?.id).toBe(firstChild.id);

    const enrollResponse = await app.request(`/api/admin/children/${firstChild.id}/status`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "diagnostics_passed",
        expectedUpdatedAt: updatedFirstChild.updatedAt
      })
    });

    const diagnosticsChild = (await enrollResponse.json()) as { updatedAt: string };

    const waitingResponse = await app.request(`/api/admin/children/${firstChild.id}/status`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "waiting_for_enrollment",
        expectedUpdatedAt: diagnosticsChild.updatedAt
      })
    });

    const waitingChild = (await waitingResponse.json()) as { updatedAt: string };

    const finalStatusResponse = await app.request(`/api/admin/children/${firstChild.id}/status`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "enrolled",
        expectedUpdatedAt: waitingChild.updatedAt
      })
    });

    expect(finalStatusResponse.status).toBe(200);
    const enrolledChild = (await finalStatusResponse.json()) as {
      queuePosition: number | null;
      updatedAt: string;
    };
    expect(enrolledChild.queuePosition).toBeNull();

    const queueResponseAfterEnrollment = await app.request("/api/admin/children?mode=queue", {
      headers: {
        Cookie: cookie
      }
    });
    const queueAfterEnrollment = (await queueResponseAfterEnrollment.json()) as {
      items: Array<{ id: number; queuePosition: number | null }>;
    };
    expect(queueAfterEnrollment.items).toHaveLength(1);
    expect(queueAfterEnrollment.items[0]).toMatchObject({
      id: secondChild.id,
      queuePosition: 1
    });

    const archiveResponse = await app.request(`/api/admin/children/${secondChild.id}/archive`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expectedUpdatedAt: secondChild.updatedAt,
        archiveReason: "Семья отказалась"
      })
    });

    expect(archiveResponse.status).toBe(200);

    const publicArchivedResponse = await app.request("/api/public/search?iin=123456789013");
    expect(publicArchivedResponse.status).toBe(404);

    const employeeAuditRows = sqlite
      .prepare(
        `select action_type as actionType, employee_id as employeeId
         from audit_events
         where child_id = ?
         order by id asc`
      )
      .all(firstChild.id) as Array<{ actionType: string; employeeId: number | null }>;

    expect(employeeAuditRows.map((row) => row.actionType)).toContain("child_updated");
    expect(employeeAuditRows.map((row) => row.actionType)).toContain("child_status_changed");
    expect(employeeAuditRows.every((row) => row.employeeId !== null)).toBe(true);

    const queueShiftEvent = sqlite
      .prepare(
        `select count(*) as count
         from notification_events
         where child_id = ? and event_type = 'queue_position_changed'`
      )
      .get(secondChild.id) as { count: number };

    expect(queueShiftEvent.count).toBeGreaterThan(0);
  });
});

async function login(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      login: "admin",
      password: "password123"
    })
  });

  expect(response.status).toBe(200);
  return getCookieHeader(response);
}

function getCookieHeader(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
