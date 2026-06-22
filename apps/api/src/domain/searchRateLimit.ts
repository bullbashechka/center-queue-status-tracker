import type { AppDb } from "../db/client.js";
import { nowUtcIso } from "../lib/time.js";

// Двухуровневое ограничение перебора публичного поиска по ИИН.
// Скользящее окно: считаем строки за последние WINDOW_MS.
export const WINDOW_MS = 15 * 60 * 1000;
export const DEVICE_LIMIT = 5;
export const IP_LIMIT = 30;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function checkAndRecordSearchAttempt(
  db: AppDb,
  params: { deviceId: string; ip: string }
): RateLimitResult {
  const now = Date.now();
  const cutoffIso = new Date(now - WINDOW_MS).toISOString();

  // Ленивая уборка протухших записей — как с employee_sessions.
  db.sqlite.prepare("delete from search_attempts where created_at <= ?").run(cutoffIso);

  const deviceCount = countInWindow(db, "device_id", params.deviceId, cutoffIso);
  const ipCount = countInWindow(db, "ip_address", params.ip, cutoffIso);

  const deviceExceeded = deviceCount >= DEVICE_LIMIT;
  const ipExceeded = ipCount >= IP_LIMIT;

  if (deviceExceeded || ipExceeded) {
    const retryCandidates: number[] = [];
    if (deviceExceeded) {
      retryCandidates.push(retryAfterSeconds(db, "device_id", params.deviceId, cutoffIso, now));
    }
    if (ipExceeded) {
      retryCandidates.push(retryAfterSeconds(db, "ip_address", params.ip, cutoffIso, now));
    }
    return { allowed: false, retryAfterSeconds: Math.max(...retryCandidates) };
  }

  db.sqlite
    .prepare("insert into search_attempts (device_id, ip_address, created_at) values (?, ?, ?)")
    .run(params.deviceId, params.ip, nowUtcIso());

  return { allowed: true };
}

function countInWindow(db: AppDb, column: "device_id" | "ip_address", value: string, cutoffIso: string): number {
  const row = db.sqlite
    .prepare(`select count(*) as count from search_attempts where ${column} = ? and created_at > ?`)
    .get(value, cutoffIso) as { count: number };
  return row.count;
}

// Окно освобождается, когда самая старая попытка в нём выпадет из 15 минут.
function retryAfterSeconds(
  db: AppDb,
  column: "device_id" | "ip_address",
  value: string,
  cutoffIso: string,
  now: number
): number {
  const row = db.sqlite
    .prepare(`select min(created_at) as oldest from search_attempts where ${column} = ? and created_at > ?`)
    .get(value, cutoffIso) as { oldest: string | null };

  if (!row.oldest) {
    return 1;
  }

  const freesAt = Date.parse(row.oldest) + WINDOW_MS;
  return Math.max(1, Math.ceil((freesAt - now) / 1000));
}
