import type { DatabaseSync } from "node:sqlite";

import { normalizePhone } from "@queue-tracker/shared";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS employees_login_unique ON employees(login)",
  `CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    iin TEXT NOT NULL,
    parent_phone TEXT NOT NULL,
    parent_phone_normalized TEXT NOT NULL,
    estimated_start_text TEXT,
    status TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    public_token TEXT NOT NULL,
    archived_at TEXT,
    archived_by_employee_id INTEGER,
    archive_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (archived_by_employee_id) REFERENCES employees(id) ON DELETE SET NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS children_public_token_unique ON children(public_token)",
  "CREATE UNIQUE INDEX IF NOT EXISTS children_active_iin_unique ON children(iin) WHERE archived_at IS NULL",
  "CREATE INDEX IF NOT EXISTS children_queue_idx ON children(archived_at, status, queued_at, id)",
  `CREATE TABLE IF NOT EXISTS employee_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    session_token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS employee_sessions_token_hash_unique ON employee_sessions(session_token_hash)",
  "CREATE INDEX IF NOT EXISTS employee_sessions_employee_id_idx ON employee_sessions(employee_id)",
  "CREATE INDEX IF NOT EXISTS employee_sessions_expires_at_idx ON employee_sessions(expires_at)",
  `CREATE TABLE IF NOT EXISTS notification_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    child_id INTEGER,
    employee_id INTEGER,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
  )`
];

export function bootstrapDatabase(sqlite: DatabaseSync): void {
  for (const statement of schemaStatements) {
    sqlite.exec(statement);
  }

  ensureChildrenPhoneColumn(sqlite);
  backfillNormalizedPhones(sqlite);
}

function ensureChildrenPhoneColumn(sqlite: DatabaseSync): void {
  const columns = sqlite
    .prepare("PRAGMA table_info(children)")
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === "parent_phone_normalized")) {
    sqlite.exec(
      "ALTER TABLE children ADD COLUMN parent_phone_normalized TEXT NOT NULL DEFAULT ''"
    );
  }
}

function backfillNormalizedPhones(sqlite: DatabaseSync): void {
  const rows = sqlite
    .prepare("SELECT id, parent_phone as parentPhone FROM children")
    .all() as Array<{ id: number; parentPhone: string }>;

  const statement = sqlite.prepare(
    "UPDATE children SET parent_phone_normalized = ? WHERE id = ?"
  );

  for (const row of rows) {
    statement.run(normalizePhone(row.parentPhone), row.id);
  }
}
