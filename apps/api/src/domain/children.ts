import {
  archiveChildSchema,
  auditActionLabels,
  changeChildStatusSchema,
  childStatusLabels,
  childStatusValues,
  createChildSchema,
  normalizeIin,
  normalizePhone,
  type AdminChildDetail,
  type AdminChildListItem,
  type AdminChildListMode,
  type ArchiveChildInput,
  type AuditEventView,
  type ChangeChildStatusInput,
  type ChildStatus,
  type CreateChildInput,
  type PublicStatusView,
  type UpdateChildInput,
  updateChildSchema
} from "@queue-tracker/shared";

import { getConfig } from "../config.js";
import { runInTransaction, type AppDb } from "../db/client.js";
import { centerLocalDate, formatCenterDateTime, nowUtcIso } from "../lib/time.js";
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

export class StaleChildRecordError extends Error {
  constructor(message = "Данные уже обновил другой сотрудник. Обновите страницу.") {
    super(message);
    this.name = "StaleChildRecordError";
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(message = "Недопустимый переход статуса.") {
    super(message);
    this.name = "InvalidStatusTransitionError";
  }
}

type ChildRow = {
  id: number;
  fullName: string;
  iin: string;
  parentPhone: string;
  parentPhoneNormalized: string;
  estimatedStartText: string | null;
  status: ChildStatus;
  queuedAt: string;
  publicToken: string;
  archivedAt: string | null;
  archivedByEmployeeId: number | null;
  archiveReason: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotificationRow = {
  eventType: string;
  payloadJson: string;
};

export async function createChild(
  db: AppDb,
  input: CreateChildInput,
  employeeId?: number | null
): Promise<PublicStatusView> {
  const parsed = createChildSchema.parse(input);
  const normalizedIin = normalizeIin(parsed.iin);
  const normalizedPhone = normalizePhone(parsed.parentPhone);
  const timestamp = nowUtcIso();

  try {
    const created = runInTransaction(db, () => {
      const child = db.sqlite
        .prepare(
          `insert into children (
            full_name,
            iin,
            parent_phone,
            parent_phone_normalized,
            estimated_start_text,
            status,
            queued_at,
            public_token,
            created_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          returning
            id,
            full_name as fullName,
            iin,
            parent_phone as parentPhone,
            parent_phone_normalized as parentPhoneNormalized,
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
          normalizedPhone,
          parsed.estimatedStartText?.trim() || null,
          "documents_accepted",
          timestamp,
          generatePublicToken(),
          timestamp,
          timestamp
        ) as ChildRow;

      insertNotificationEvent(db, child.id, "queue_created", {
        token: child.publicToken,
        status: child.status
      }, timestamp);

      insertAuditEvent(db, child.id, employeeId ?? null, "child_created", {
        iin: child.iin
      }, timestamp);

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

export async function listAdminChildren(
  db: AppDb,
  filters: {
    mode: AdminChildListMode;
    query?: string;
    status?: ChildStatus | "";
  }
): Promise<AdminChildListItem[]> {
  const searchQuery = filters.query?.trim() ?? "";
  const normalizedDigits = searchQuery ? normalizeDigitsQuery(searchQuery) : "";
  const queueMap = getActiveQueuePositionMap(db);

  const rows = db.sqlite
    .prepare(
      `select
        id,
        full_name as fullName,
        iin,
        parent_phone as parentPhone,
        parent_phone_normalized as parentPhoneNormalized,
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
      where archived_at is null
        and (? = 'queue' and status != 'enrolled' or ? = 'enrolled' and status = 'enrolled')
        and (? = '' or status = ?)
        and (
          ? = ''
          or lower(full_name) like '%' || lower(?) || '%'
          or iin like '%' || ? || '%'
          or parent_phone_normalized like '%' || ? || '%'
        )
      order by
        case when ? = 'queue' then queued_at end asc,
        case when ? = 'queue' then id end asc,
        case when ? = 'enrolled' then updated_at end desc,
        case when ? = 'enrolled' then id end desc`
    )
    .all(
      filters.mode,
      filters.mode,
      filters.status ?? "",
      filters.status ?? "",
      searchQuery,
      searchQuery,
      normalizedDigits,
      normalizedDigits,
      filters.mode,
      filters.mode,
      filters.mode,
      filters.mode
    ) as ChildRow[];

  return rows.map((row) => mapChildToAdminListItem(row, queueMap.get(row.id) ?? null));
}

export async function getAdminChildById(db: AppDb, childId: number): Promise<AdminChildDetail | null> {
  const child = getChildRowById(db, childId);

  if (!child || child.archivedAt) {
    return null;
  }

  const queue = await getQueueSnapshotForChild(db, child);
  return mapChildToAdminDetail(child, queue.queuePosition, queue.familiesAhead, getLastNotificationMessage(db, child));
}

type AuditEventRow = {
  id: number;
  actionType: string;
  payloadJson: string;
  employeeName: string | null;
  createdAt: string;
};

export async function listChildAuditEvents(db: AppDb, childId: number): Promise<AuditEventView[]> {
  const rows = db.sqlite
    .prepare(
      `select
        a.id as id,
        a.action_type as actionType,
        a.payload_json as payloadJson,
        e.display_name as employeeName,
        a.created_at as createdAt
      from audit_events a
      left join employees e on e.id = a.employee_id
      where a.child_id = ?
      order by a.id desc
      limit 50`
    )
    .all(childId) as AuditEventRow[];

  const timeZone = getConfig().CENTER_TIMEZONE;

  return rows.map((row) => ({
    id: row.id,
    actionLabel: auditActionLabels[row.actionType] ?? row.actionType,
    details: buildAuditDetails(row.actionType, row.payloadJson),
    employeeName: row.employeeName,
    createdAtLabel: formatCenterDateTime(row.createdAt, timeZone)
  }));
}

function buildAuditDetails(actionType: string, payloadJson: string): string | null {
  const payload = JSON.parse(payloadJson) as Record<string, unknown>;

  if (actionType === "child_status_changed" || actionType === "child_status_reverted") {
    const fromLabel = childStatusLabels[payload.fromStatus as ChildStatus];
    const toLabel = childStatusLabels[payload.toStatus as ChildStatus];

    if (fromLabel && toLabel) {
      return `${fromLabel} → ${toLabel}`;
    }

    return null;
  }

  if (actionType === "child_archived") {
    const reason = typeof payload.archiveReason === "string" ? payload.archiveReason.trim() : "";
    return reason ? `Причина: ${reason}` : null;
  }

  if (actionType === "child_updated") {
    const previousIin = typeof payload.previousIin === "string" ? payload.previousIin : null;
    const nextIin = typeof payload.nextIin === "string" ? payload.nextIin : null;

    if (previousIin && nextIin && previousIin !== nextIin) {
      return `ИИН: ${previousIin} → ${nextIin}`;
    }

    return null;
  }

  return null;
}

export async function updateChild(
  db: AppDb,
  childId: number,
  input: UpdateChildInput,
  employeeId: number
): Promise<AdminChildDetail> {
  const parsed = updateChildSchema.parse(input);
  const current = getRequiredActiveChildRow(db, childId);
  ensureFreshChildRecord(current, parsed.expectedUpdatedAt);
  const timestamp = nowUtcIso();

  try {
    const updated = runInTransaction(db, () => {
      const child = db.sqlite
        .prepare(
          `update children
           set
             full_name = ?,
             iin = ?,
             parent_phone = ?,
             parent_phone_normalized = ?,
             estimated_start_text = ?,
             updated_at = ?
           where id = ? and archived_at is null
           returning
             id,
             full_name as fullName,
             iin,
             parent_phone as parentPhone,
             parent_phone_normalized as parentPhoneNormalized,
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
          normalizeIin(parsed.iin),
          parsed.parentPhone.trim(),
          normalizePhone(parsed.parentPhone),
          parsed.estimatedStartText?.trim() || null,
          timestamp,
          childId
        ) as ChildRow | undefined;

      if (!child) {
        throw new ChildNotFoundError();
      }

      insertAuditEvent(db, child.id, employeeId, "child_updated", {
        previousIin: current.iin,
        nextIin: child.iin
      }, timestamp);

      return child;
    });

    const queue = await getQueueSnapshotForChild(db, updated);
    return mapChildToAdminDetail(updated, queue.queuePosition, queue.familiesAhead, getLastNotificationMessage(db, updated));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ChildConflictError();
    }

    throw error;
  }
}

export async function archiveChild(
  db: AppDb,
  childId: number,
  input: ArchiveChildInput,
  employeeId?: number | null
): Promise<ChildRow> {
  const parsed = archiveChildSchema.parse(input);
  const current = getRequiredActiveChildRow(db, childId);

  if (parsed.expectedUpdatedAt) {
    ensureFreshChildRecord(current, parsed.expectedUpdatedAt);
  }

  const timestamp = nowUtcIso();

  const archived = runInTransaction(db, () => {
    const beforePositions = getActiveQueuePositionMap(db);
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
           parent_phone_normalized as parentPhoneNormalized,
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
        employeeId ?? parsed.archivedByEmployeeId ?? null,
        parsed.archiveReason?.trim() || null,
        timestamp,
        childId
      ) as ChildRow | undefined;

    if (!child) {
      throw new ChildNotFoundError();
    }

    const afterPositions = getActiveQueuePositionMap(db);
    insertQueuePositionChangeEvents(db, beforePositions, afterPositions, timestamp);

    insertAuditEvent(db, child.id, employeeId ?? parsed.archivedByEmployeeId ?? null, "child_archived", {
      archiveReason: parsed.archiveReason?.trim() || null
    }, timestamp);

    return child;
  });

  return archived;
}

export async function changeChildStatus(
  db: AppDb,
  childId: number,
  input: ChangeChildStatusInput,
  employeeId: number
): Promise<AdminChildDetail> {
  const parsed = changeChildStatusSchema.parse(input);
  const current = getRequiredActiveChildRow(db, childId);
  ensureFreshChildRecord(current, parsed.expectedUpdatedAt);
  assertAllowedStatusTransition(current.status, parsed.status);
  const timestamp = nowUtcIso();

  const updated = runInTransaction(db, () => {
    const beforePositions = getActiveQueuePositionMap(db);
    const child = db.sqlite
      .prepare(
        `update children
         set status = ?, updated_at = ?
         where id = ? and archived_at is null
         returning
           id,
           full_name as fullName,
           iin,
           parent_phone as parentPhone,
           parent_phone_normalized as parentPhoneNormalized,
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
      .get(parsed.status, timestamp, childId) as ChildRow | undefined;

    if (!child) {
      throw new ChildNotFoundError();
    }

    const afterPositions = getActiveQueuePositionMap(db);
    insertQueuePositionChangeEvents(db, beforePositions, afterPositions, timestamp);

    insertNotificationEvent(db, child.id, "status_changed", {
      token: child.publicToken,
      fromStatus: current.status,
      toStatus: child.status
    }, timestamp);

    insertAuditEvent(
      db,
      child.id,
      employeeId,
      isBackwardTransition(current.status, child.status)
        ? "child_status_reverted"
        : "child_status_changed",
      {
        fromStatus: current.status,
        toStatus: child.status
      },
      timestamp
    );

    return child;
  });

  const queue = await getQueueSnapshotForChild(db, updated);
  return mapChildToAdminDetail(updated, queue.queuePosition, queue.familiesAhead, getLastNotificationMessage(db, updated));
}

export async function findArchivedDuplicateByIin(db: AppDb, rawIin: string): Promise<boolean> {
  const normalizedIin = normalizeIin(rawIin);

  if (!/^\d{12}$/.test(normalizedIin)) {
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
        parent_phone_normalized as parentPhoneNormalized,
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

  if (!/^\d{12}$/.test(normalizedIin)) {
    throw new InvalidIinFormatError();
  }

  const child = db.sqlite
    .prepare(
      `select
        id,
        full_name as fullName,
        iin,
        parent_phone as parentPhone,
        parent_phone_normalized as parentPhoneNormalized,
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

function mapChildToPublicView(
  row: ChildRow,
  queue: { queuePosition: number | null; familiesAhead: number | null }
): PublicStatusView {
  return {
    id: row.id,
    token: row.publicToken,
    fullName: row.fullName,
    status: row.status,
    statusLabel: childStatusLabels[row.status],
    estimatedStartText: row.estimatedStartText ?? null,
    queuePosition: queue.queuePosition,
    familiesAhead: queue.familiesAhead
  };
}

function mapChildToAdminListItem(
  row: ChildRow,
  queuePosition: number | null
): AdminChildListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    iin: row.iin,
    parentPhone: row.parentPhone,
    estimatedStartText: row.estimatedStartText ?? null,
    status: row.status,
    statusLabel: childStatusLabels[row.status],
    queuePosition,
    familiesAhead: queuePosition ? queuePosition - 1 : null,
    token: row.publicToken,
    queuedAt: row.queuedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapChildToAdminDetail(
  row: ChildRow,
  queuePosition: number | null,
  familiesAhead: number | null,
  lastNotificationMessage: string | null
): AdminChildDetail {
  return {
    ...mapChildToAdminListItem(row, queuePosition),
    familiesAhead,
    lastNotificationMessage
  };
}

function getRequiredActiveChildRow(db: AppDb, childId: number): ChildRow {
  const child = getChildRowById(db, childId);

  if (!child || child.archivedAt) {
    throw new ChildNotFoundError();
  }

  return child;
}

function getChildRowById(db: AppDb, childId: number): ChildRow | null {
  const child = db.sqlite
    .prepare(
      `select
        id,
        full_name as fullName,
        iin,
        parent_phone as parentPhone,
        parent_phone_normalized as parentPhoneNormalized,
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
      where id = ?
      limit 1`
    )
    .get(childId) as ChildRow | undefined;

  return child ?? null;
}

function ensureFreshChildRecord(child: ChildRow, expectedUpdatedAt: string): void {
  if (child.updatedAt !== expectedUpdatedAt) {
    throw new StaleChildRecordError();
  }
}

function getActiveQueuePositionMap(db: AppDb): Map<number, number> {
  const rows = db.sqlite
    .prepare(
      `select id
       from children
       where archived_at is null and status != 'enrolled'
       order by queued_at asc, id asc`
    )
    .all() as Array<{ id: number }>;

  const positions = new Map<number, number>();

  rows.forEach((row, index) => {
    positions.set(row.id, index + 1);
  });

  return positions;
}

function insertQueuePositionChangeEvents(
  db: AppDb,
  beforePositions: Map<number, number>,
  afterPositions: Map<number, number>,
  timestamp: string
): void {
  for (const [childId, nextPosition] of afterPositions) {
    const previousPosition = beforePositions.get(childId);

    if (previousPosition === nextPosition) {
      continue;
    }

    upsertDailyQueuePositionEvent(db, childId, previousPosition ?? null, nextPosition, timestamp);
  }
}

type DailyQueueEventRow = {
  id: number;
  payloadJson: string;
  createdAt: string;
};

// Хранит не более одной записи о продвижении очереди в сутки на ребёнка
// (по часовому поясу центра): за день обновляется актуальная позиция, а не
// создаётся отдельное событие на каждое движение.
function upsertDailyQueuePositionEvent(
  db: AppDb,
  childId: number,
  previousPosition: number | null,
  nextPosition: number,
  timestamp: string
): void {
  const latest = db.sqlite
    .prepare(
      `select id, payload_json as payloadJson, created_at as createdAt
       from notification_events
       where child_id = ? and event_type = 'queue_position_changed'
       order by id desc
       limit 1`
    )
    .get(childId) as DailyQueueEventRow | undefined;

  const timeZone = getConfig().CENTER_TIMEZONE;

  if (latest && centerLocalDate(latest.createdAt, timeZone) === centerLocalDate(timestamp, timeZone)) {
    const existingPayload = JSON.parse(latest.payloadJson) as { previousPosition?: number | null };

    db.sqlite
      .prepare(
        `update notification_events
         set payload_json = ?, created_at = ?
         where id = ?`
      )
      .run(
        JSON.stringify({
          previousPosition: existingPayload.previousPosition ?? null,
          nextPosition
        }),
        timestamp,
        latest.id
      );

    return;
  }

  insertNotificationEvent(db, childId, "queue_position_changed", {
    previousPosition,
    nextPosition
  }, timestamp);
}

function insertNotificationEvent(
  db: AppDb,
  childId: number,
  eventType: string,
  payload: Record<string, unknown>,
  createdAt: string
): void {
  db.sqlite
    .prepare(
      `insert into notification_events (child_id, event_type, payload_json, created_at)
       values (?, ?, ?, ?)`
    )
    .run(childId, eventType, JSON.stringify(payload), createdAt);
}

function insertAuditEvent(
  db: AppDb,
  childId: number,
  employeeId: number | null,
  actionType: string,
  payload: Record<string, unknown>,
  createdAt: string
): void {
  db.sqlite
    .prepare(
      `insert into audit_events (child_id, employee_id, action_type, payload_json, created_at)
       values (?, ?, ?, ?, ?)`
    )
    .run(childId, employeeId, actionType, JSON.stringify(payload), createdAt);
}

function getLastNotificationMessage(db: AppDb, child: ChildRow): string | null {
  const statusUrl = `${getConfig().PUBLIC_APP_URL}/status/${child.publicToken}`;
  const event = db.sqlite
    .prepare(
      `select event_type as eventType, payload_json as payloadJson
       from notification_events
       where child_id = ?
       order by id desc
       limit 1`
    )
    .get(child.id) as NotificationRow | undefined;

  if (!event) {
    return null;
  }

  const payload = JSON.parse(event.payloadJson) as Record<string, unknown>;

  if (event.eventType === "queue_created") {
    return `Ребёнок поставлен в очередь. Страница статуса: ${statusUrl}`;
  }

  if (event.eventType === "status_changed") {
    return `Статус заявки изменён: ${childStatusLabels[String(payload.toStatus) as ChildStatus]}. Страница статуса: ${statusUrl}`;
  }

  if (event.eventType === "queue_position_changed") {
    const nextPosition = Number(payload.nextPosition ?? 0);
    const familiesAhead = Math.max(nextPosition - 1, 0);
    return `Очередь продвинулась. Сейчас номер в очереди: ${nextPosition}. Семей впереди: ${familiesAhead}. Страница статуса: ${statusUrl}`;
  }

  return null;
}

function assertAllowedStatusTransition(currentStatus: ChildStatus, nextStatus: ChildStatus): void {
  const currentIndex = childStatusValues.indexOf(currentStatus);
  const nextIndex = childStatusValues.indexOf(nextStatus);

  if (nextIndex === -1 || currentIndex === -1 || nextIndex === currentIndex) {
    throw new InvalidStatusTransitionError();
  }

  if (nextIndex > currentIndex + 1) {
    throw new InvalidStatusTransitionError("Нельзя пропустить этап очереди.");
  }
}

function isBackwardTransition(currentStatus: ChildStatus, nextStatus: ChildStatus): boolean {
  return childStatusValues.indexOf(nextStatus) < childStatusValues.indexOf(currentStatus);
}

function normalizeDigitsQuery(query: string): string {
  return normalizePhone(query);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
