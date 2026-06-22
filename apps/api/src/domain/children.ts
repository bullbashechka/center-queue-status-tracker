import {
  archiveChildSchema,
  childStatusLabels,
  createChildSchema,
  isValidIin,
  normalizeIin,
  type ArchiveChildInput,
  type CreateChildInput,
  type PublicStatusView
} from "@queue-tracker/shared";

import { runInTransaction, type AppDb } from "../db/client.js";
import { nowUtcIso } from "../lib/time.js";
import { generatePublicToken } from "../lib/token.js";
import { getQueueSnapshotForChild } from "./queue.js";

export class ChildConflictError extends Error {
  constructor(message = "Активная запись с таким ИИН уже существует.") {
    super(message);
    this.name = "ChildConflictError";
  }
}

export class ChildNotFoundError extends Error {
  constructor(message = "Запись не найдена.") {
    super(message);
    this.name = "ChildNotFoundError";
  }
}

export class InvalidIinFormatError extends Error {
  constructor(message = "Введите ИИН из 12 цифр.") {
    super(message);
    this.name = "InvalidIinFormatError";
  }
}

type ChildRow = {
  id: number;
  fullName: string;
  iin: string;
  parentPhone: string;
  estimatedStartText: string | null;
  status: string;
  queuedAt: string;
  publicToken: string;
  archivedAt: string | null;
  archivedByEmployeeId: number | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapChildToPublicView(row: ChildRow, queue: { queuePosition: number | null; familiesAhead: number | null }): PublicStatusView {
  return {
    id: row.id,
    token: row.publicToken,
    fullName: row.fullName,
    status: row.status as PublicStatusView["status"],
    statusLabel: childStatusLabels[row.status as keyof typeof childStatusLabels],
    estimatedStartText: row.estimatedStartText ?? null,
    queuePosition: queue.queuePosition,
    familiesAhead: queue.familiesAhead
  };
}

export async function createChild(db: AppDb, input: CreateChildInput) {
  const parsed = createChildSchema.parse(input);
  const normalizedIin = normalizeIin(parsed.iin);

  if (!isValidIin(normalizedIin)) {
    throw new InvalidIinFormatError();
  }

  const timestamp = nowUtcIso();

  try {
    const created = runInTransaction(db, () => {
      const child = db.sqlite
        .prepare(
          `insert into children (
            full_name,
            iin,
            parent_phone,
            estimated_start_text,
            status,
            queued_at,
            public_token,
            created_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
          returning
            id,
            full_name as fullName,
            iin,
            parent_phone as parentPhone,
            estimated_start_text as estimatedStartText,
            status,
            queued_at as queuedAt,
            public_token as publicToken,
            archived_at as archivedAt,
            archived_by_employee_id as archivedByEmployeeId,
            archive_reason as archiveReason,
            created_at as createdAt,
            updated_at as updatedAt`
        )
        .get(
          parsed.fullName.trim(),
          normalizedIin,
          parsed.parentPhone.trim(),
          parsed.estimatedStartText?.trim() || null,
          "documents_accepted",
          timestamp,
          generatePublicToken(),
          timestamp,
          timestamp
        ) as ChildRow;

      db.sqlite
        .prepare(
          `insert into notification_events (child_id, event_type, payload_json, created_at)
           values (?, ?, ?, ?)`
        )
        .run(
          child.id,
          "queue_created",
          JSON.stringify({
            status: child.status,
            token: child.publicToken
          }),
          timestamp
        );

      db.sqlite
        .prepare(
          `insert into audit_events (child_id, employee_id, action_type, payload_json, created_at)
           values (?, ?, ?, ?, ?)`
        )
        .run(
          child.id,
          null,
          "child_created",
          JSON.stringify({
            iin: child.iin
          }),
          timestamp
        );

      return child;
    });

    const queue = await getQueueSnapshotForChild(db, created);
    return mapChildToPublicView(created, queue);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ChildConflictError();
    }

    throw error;
  }
}

export async function archiveChild(db: AppDb, childId: number, input: ArchiveChildInput) {
  const parsed = archiveChildSchema.parse(input);
  const timestamp = nowUtcIso();

  const archived = runInTransaction(db, () => {
    const child = db.sqlite
      .prepare(
        `update children
         set archived_at = ?, archived_by_employee_id = ?, archive_reason = ?, updated_at = ?
         where id = ? and archived_at is null
         returning
           id,
           full_name as fullName,
           iin,
           parent_phone as parentPhone,
           estimated_start_text as estimatedStartText,
           status,
           queued_at as queuedAt,
           public_token as publicToken,
           archived_at as archivedAt,
           archived_by_employee_id as archivedByEmployeeId,
           archive_reason as archiveReason,
           created_at as createdAt,
           updated_at as updatedAt`
      )
      .get(
        timestamp,
        parsed.archivedByEmployeeId ?? null,
        parsed.archiveReason?.trim() || null,
        timestamp,
        childId
      ) as ChildRow | undefined;

    if (!child) {
      return null;
    }

    db.sqlite
      .prepare(
        `insert into audit_events (child_id, employee_id, action_type, payload_json, created_at)
         values (?, ?, ?, ?, ?)`
      )
      .run(
        child.id,
        parsed.archivedByEmployeeId ?? null,
        "child_archived",
        JSON.stringify({
          archiveReason: parsed.archiveReason?.trim() || null
        }),
        timestamp
      );

    return child;
  });

  if (!archived) {
    throw new ChildNotFoundError();
  }

  return archived;
}

export async function findArchivedDuplicateByIin(db: AppDb, rawIin: string) {
  const normalizedIin = normalizeIin(rawIin);

  if (!isValidIin(normalizedIin)) {
    throw new InvalidIinFormatError();
  }

  const row = db.sqlite
    .prepare(`select count(*) as count from children where iin = ? and archived_at is not null`)
    .get(normalizedIin) as { count: number } | undefined;

  return Number(row?.count ?? 0) > 0;
}

export async function getPublicStatusByToken(db: AppDb, token: string): Promise<PublicStatusView | null> {
  const child = db.sqlite
    .prepare(
      `select
        id,
        full_name as fullName,
        iin,
        parent_phone as parentPhone,
        estimated_start_text as estimatedStartText,
        status,
        queued_at as queuedAt,
        public_token as publicToken,
        archived_at as archivedAt,
        archived_by_employee_id as archivedByEmployeeId,
        archive_reason as archiveReason,
        created_at as createdAt,
        updated_at as updatedAt
      from children
      where public_token = ? and archived_at is null
      limit 1`
    )
    .get(token) as ChildRow | undefined;

  if (!child) {
    return null;
  }

  const queue = await getQueueSnapshotForChild(db, child);
  return mapChildToPublicView(child, queue);
}

export async function getPublicStatusByIin(db: AppDb, rawIin: string): Promise<PublicStatusView | null> {
  const normalizedIin = normalizeIin(rawIin);

  if (!isValidIin(normalizedIin)) {
    throw new InvalidIinFormatError();
  }

  const child = db.sqlite
    .prepare(
      `select
        id,
        full_name as fullName,
        iin,
        parent_phone as parentPhone,
        estimated_start_text as estimatedStartText,
        status,
        queued_at as queuedAt,
        public_token as publicToken,
        archived_at as archivedAt,
        archived_by_employee_id as archivedByEmployeeId,
        archive_reason as archiveReason,
        created_at as createdAt,
        updated_at as updatedAt
      from children
      where iin = ? and archived_at is null
      limit 1`
    )
    .get(normalizedIin) as ChildRow | undefined;

  if (!child) {
    return null;
  }

  const queue = await getQueueSnapshotForChild(db, child);
  return mapChildToPublicView(child, queue);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
