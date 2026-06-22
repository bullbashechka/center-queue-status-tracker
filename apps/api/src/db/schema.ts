import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const employees = sqliteTable(
  "employees",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    login: text("login").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [uniqueIndex("employees_login_unique").on(table.login)]
);

export const children = sqliteTable(
  "children",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    iin: text("iin").notNull(),
    parentPhone: text("parent_phone").notNull(),
    parentPhoneNormalized: text("parent_phone_normalized").notNull(),
    estimatedStartText: text("estimated_start_text"),
    status: text("status").notNull(),
    queuedAt: text("queued_at").notNull(),
    publicToken: text("public_token").notNull(),
    archivedAt: text("archived_at"),
    archivedByEmployeeId: integer("archived_by_employee_id").references(() => employees.id, {
      onDelete: "set null"
    }),
    archiveReason: text("archive_reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => [
    uniqueIndex("children_public_token_unique").on(table.publicToken),
    uniqueIndex("children_active_iin_unique").on(table.iin).where(sql`${table.archivedAt} is null`),
    index("children_queue_idx").on(table.archivedAt, table.status, table.queuedAt, table.id)
  ]
);

export const employeeSessions = sqliteTable(
  "employee_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    uniqueIndex("employee_sessions_token_hash_unique").on(table.sessionTokenHash),
    index("employee_sessions_employee_id_idx").on(table.employeeId),
    index("employee_sessions_expires_at_idx").on(table.expiresAt)
  ]
);

export const searchAttempts = sqliteTable(
  "search_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deviceId: text("device_id").notNull(),
    ipAddress: text("ip_address").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => [
    index("search_attempts_device_idx").on(table.deviceId, table.createdAt),
    index("search_attempts_ip_idx").on(table.ipAddress, table.createdAt)
  ]
);

export const notificationEvents = sqliteTable("notification_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  childId: integer("child_id").references(() => children.id, { onDelete: "set null" }),
  employeeId: integer("employee_id").references(() => employees.id, { onDelete: "set null" }),
  actionType: text("action_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const schema = {
  employees,
  employeeSessions,
  searchAttempts,
  children,
  notificationEvents,
  auditEvents
};
