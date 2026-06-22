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
  children,
  notificationEvents,
  auditEvents
};

