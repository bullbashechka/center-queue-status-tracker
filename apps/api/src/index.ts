import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { bootstrapDatabase } from "./db/bootstrap.js";
import { createDb, createSqlite } from "./db/client.js";

const config = getConfig();
const sqlite = createSqlite(config.DATABASE_URL);
bootstrapDatabase(sqlite);

const db = createDb(sqlite);
const app = createApp(db);

serve(
  {
    fetch: app.fetch,
    port: config.API_PORT
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  }
);

