import {
  adminChildListModeSchema,
  adminChildListResponseSchema,
  auditEventListResponseSchema,
  changeChildStatusSchema,
  childStatusSchema,
  createChildSchema,
  updateChildSchema
} from "@queue-tracker/shared";
import type { Context, Hono } from "hono";
import { ZodError } from "zod";

import type { AppDb } from "../db/client.js";
import {
  archiveChild,
  changeChildStatus,
  ChildConflictError,
  ChildNotFoundError,
  createChild,
  getAdminChildById,
  InvalidStatusTransitionError,
  listAdminChildren,
  listChildAuditEvents,
  StaleChildRecordError,
  updateChild
} from "../domain/children.js";
import type { AppEnv } from "../http.js";

export function registerAdminRoutes(app: Hono<AppEnv>, db: AppDb) {
  app.get("/api/admin/children", async (c) => {
    const modeResult = adminChildListModeSchema.safeParse(c.req.query("mode") ?? "queue");

    if (!modeResult.success) {
      return c.json({ message: "Некорректный режим списка." }, 400);
    }

    const statusParam = c.req.query("status") ?? "";

    if (statusParam) {
      const statusResult = childStatusSchema.safeParse(statusParam);

      if (!statusResult.success) {
        return c.json({ message: "Некорректный фильтр статуса." }, 400);
      }
    }

    const items = await listAdminChildren(db, {
      mode: modeResult.data,
      query: c.req.query("query") ?? "",
      status: statusParam ? childStatusSchema.parse(statusParam) : ""
    });

    return c.json(adminChildListResponseSchema.parse({ items }));
  });

  app.get("/api/admin/children/:id", async (c) => {
    const childId = Number(c.req.param("id"));
    const child = await getAdminChildById(db, childId);

    if (!child) {
      return c.json({ message: "Запись не найдена." }, 404);
    }

    return c.json(child);
  });

  app.get("/api/admin/children/:id/audit", async (c) => {
    const childId = Number(c.req.param("id"));
    const child = await getAdminChildById(db, childId);

    if (!child) {
      return c.json({ message: "Запись не найдена." }, 404);
    }

    const items = await listChildAuditEvents(db, childId);

    return c.json(auditEventListResponseSchema.parse({ items }));
  });

  app.post("/api/admin/children", async (c) => {
    const body = await c.req.json().catch(() => ({}));

    try {
      createChildSchema.parse(body);
      const created = await createChild(db, body, c.get("employee").id);
      const detail = await getAdminChildById(db, created.id);

      return c.json(detail, 201);
    } catch (error) {
      return mapAdminError(c, error);
    }
  });

  app.put("/api/admin/children/:id", async (c) => {
    const childId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));

    try {
      updateChildSchema.parse(body);
      const updated = await updateChild(db, childId, body, c.get("employee").id);
      return c.json(updated);
    } catch (error) {
      return mapAdminError(c, error);
    }
  });

  app.post("/api/admin/children/:id/archive", async (c) => {
    const childId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));

    try {
      const archived = await archiveChild(db, childId, body, c.get("employee").id);
      return c.json({
        id: archived.id,
        archivedAt: archived.archivedAt
      });
    } catch (error) {
      return mapAdminError(c, error);
    }
  });

  app.post("/api/admin/children/:id/status", async (c) => {
    const childId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));

    try {
      changeChildStatusSchema.parse(body);
      const updated = await changeChildStatus(db, childId, body, c.get("employee").id);
      return c.json(updated);
    } catch (error) {
      return mapAdminError(c, error);
    }
  });
}

function mapAdminError(c: Context<AppEnv>, error: unknown) {
  if (error instanceof ChildNotFoundError) {
    return c.json({ message: error.message }, 404);
  }

  if (
    error instanceof ChildConflictError ||
    error instanceof StaleChildRecordError ||
    error instanceof InvalidStatusTransitionError
  ) {
    return c.json({ message: error.message }, 409);
  }

  if (error instanceof ZodError) {
    return c.json({ message: error.issues[0]?.message ?? "Проверьте введённые данные." }, 400);
  }

  throw error;
}
