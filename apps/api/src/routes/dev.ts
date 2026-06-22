import type { Hono } from "hono";

import { ChildConflictError, ChildNotFoundError, InvalidIinFormatError, archiveChild, createChild, findArchivedDuplicateByIin } from "../domain/children.js";
import type { AppDb } from "../db/client.js";

export function registerDevRoutes(app: Hono, db: AppDb) {
  app.post("/api/dev/children", async (c) => {
    const body = await c.req.json();

    try {
      const child = await createChild(db, body);
      const hasArchivedDuplicate = await findArchivedDuplicateByIin(db, body.iin ?? "");

      return c.json(
        {
          ...child,
          hasArchivedDuplicate
        },
        201
      );
    } catch (error) {
      if (
        error instanceof ChildConflictError ||
        error instanceof InvalidIinFormatError
      ) {
        return c.json({ message: error.message }, 409);
      }

      throw error;
    }
  });

  app.post("/api/dev/children/:id/archive", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));

    try {
      const archived = await archiveChild(db, id, body);
      return c.json({
        id: archived.id,
        archivedAt: archived.archivedAt
      });
    } catch (error) {
      if (error instanceof ChildNotFoundError) {
        return c.json({ message: error.message }, 404);
      }

      throw error;
    }
  });
}

