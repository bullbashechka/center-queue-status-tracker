import type { AppDb } from "../db/client.js";

export type QueueSnapshot = {
  queuePosition: number | null;
  familiesAhead: number | null;
};

export async function getQueueSnapshotForChild(
  db: AppDb,
  child: {
    id: number;
    status: string;
    archivedAt: string | null;
    queuedAt: string;
  }
): Promise<QueueSnapshot> {
  if (child.archivedAt || child.status === "enrolled") {
    return {
      queuePosition: null,
      familiesAhead: null
    };
  }

  const row = db.sqlite
    .prepare(
      `select count(*) as count
       from children
       where archived_at is null
         and status != 'enrolled'
         and (
           queued_at < ?
           or (queued_at = ? and id < ?)
         )`
    )
    .get(child.queuedAt, child.queuedAt, child.id) as { count: number } | undefined;

  const familiesAhead = Number(row?.count ?? 0);

  return {
    queuePosition: familiesAhead + 1,
    familiesAhead
  };
}
