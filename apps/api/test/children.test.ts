import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { bootstrapDatabase } from "../src/db/bootstrap.js";
import { createDb } from "../src/db/client.js";
import { archiveChild, createChild, getPublicStatusByIin, getPublicStatusByToken } from "../src/domain/children.js";

describe("children domain", () => {
  let sqlite: DatabaseSync;
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    process.env.PUBLIC_APP_URL = "http://localhost:5173";
    process.env.SESSION_SECRET = "test-session-secret-with-at-least-32-chars";
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    bootstrapDatabase(sqlite);
    db = createDb(sqlite);
  });

  it("creates an active child with the required fields", async () => {
    const created = await createChild(db, {
      fullName: "Тестовый Ребёнок",
      iin: "123456789012",
      parentPhone: "+77010000000"
    });

    expect(created.fullName).toBe("Тестовый Ребёнок");
    expect(created.status).toBe("documents_accepted");
    expect(created.queuePosition).toBe(1);
    expect(created.token).toHaveLength(48);
  });

  it("rejects two active records with the same IIN", async () => {
    await createChild(db, {
      fullName: "Первый",
      iin: "123456789012",
      parentPhone: "+77010000000"
    });

    await expect(
      createChild(db, {
        fullName: "Второй",
        iin: "123456789012",
        parentPhone: "+77010000001"
      })
    ).rejects.toThrow("Активная запись с таким ИИН уже существует.");
  });

  it("allows a new active record after archiving the previous one", async () => {
    const first = await createChild(db, {
      fullName: "Первый",
      iin: "123456789012",
      parentPhone: "+77010000000"
    });

    await archiveChild(db, first.id, {});

    const second = await createChild(db, {
      fullName: "Второй",
      iin: "123456789012",
      parentPhone: "+77010000001"
    });

    expect(second.id).not.toBe(first.id);
  });

  it("computes queue positions by queuedAt and excludes enrolled children", async () => {
    const first = await createChild(db, {
      fullName: "Первый",
      iin: "123456789012",
      parentPhone: "+77010000000"
    });

    const second = await createChild(db, {
      fullName: "Второй",
      iin: "123456789013",
      parentPhone: "+77010000001"
    });

    expect(first.queuePosition).toBe(1);
    expect(second.queuePosition).toBe(2);
    expect(second.familiesAhead).toBe(1);
  });

  it("keeps public status available by token and IIN until archiving", async () => {
    const created = await createChild(db, {
      fullName: "Ребёнок",
      iin: "1234 5678 9012",
      parentPhone: "+77010000000"
    });

    const byToken = await getPublicStatusByToken(db, created.token);
    const byIin = await getPublicStatusByIin(db, "1234-5678-9012");

    expect(byToken?.id).toBe(created.id);
    expect(byIin?.id).toBe(created.id);

    await archiveChild(db, created.id, {});

    await expect(getPublicStatusByIin(db, "123456789012")).resolves.toBeNull();
    await expect(getPublicStatusByToken(db, created.token)).resolves.toBeNull();
  });

  it("returns neutral search errors through the public API", async () => {
    const app = createApp(db);

    const invalid = await app.request("/api/public/search?iin=123");
    const missing = await app.request("/api/public/search?iin=123456789012");

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ message: "Введите ИИН из 12 цифр." });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ message: "Заявка не найдена" });
  });
});
