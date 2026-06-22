import type { Hono } from "hono";

import { InvalidIinFormatError, getPublicStatusByIin, getPublicStatusByToken } from "../domain/children.js";
import type { AppDb } from "../db/client.js";

const notFoundMessage = "Заявка не найдена или ссылка недействительна";

export function registerPublicRoutes(app: Hono, db: AppDb) {
  app.get("/api/public/status/:token", async (c) => {
    const token = c.req.param("token");
    const status = await getPublicStatusByToken(db, token);

    if (!status) {
      return c.json({ message: notFoundMessage }, 404);
    }

    return c.json(status);
  });

  app.get("/api/public/search", async (c) => {
    const iin = c.req.query("iin") ?? "";

    try {
      const status = await getPublicStatusByIin(db, iin);

      if (!status) {
        return c.json({ message: "Заявка не найдена" }, 404);
      }

      return c.json(status);
    } catch (error) {
      if (error instanceof InvalidIinFormatError) {
        return c.json({ message: error.message }, 400);
      }

      throw error;
    }
  });
}

