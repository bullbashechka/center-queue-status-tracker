import type { EmployeeSession, LoginInput } from "@queue-tracker/shared";
import { loginInputSchema } from "@queue-tracker/shared";

import type { AppDb } from "../db/client.js";
import { nowUtcIso } from "../lib/time.js";
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyPassword
} from "../lib/security.js";

const SESSION_TTL_HOURS = 12;

type EmployeeRow = {
  id: number;
  login: string;
  passwordHash: string;
  displayName: string;
  isActive: number;
};

export class InvalidCredentialsError extends Error {
  constructor(message = "Неверный логин или пароль.") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export async function authenticateEmployee(db: AppDb, input: LoginInput): Promise<EmployeeSession> {
  const parsed = loginInputSchema.parse(input);
  const employee = db.sqlite
    .prepare(
      `select
        id,
        login,
        password_hash as passwordHash,
        display_name as displayName,
        is_active as isActive
      from employees
      where login = ?
      limit 1`
    )
    .get(parsed.login.trim()) as EmployeeRow | undefined;

  if (!employee || !employee.isActive || !verifyPassword(parsed.password, employee.passwordHash)) {
    throw new InvalidCredentialsError();
  }

  return {
    id: employee.id,
    login: employee.login,
    displayName: employee.displayName
  };
}

export async function createEmployeeSession(
  db: AppDb,
  employee: EmployeeSession,
  sessionSecret: string
): Promise<{ token: string; expiresAt: string }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token, sessionSecret);
  const createdAt = nowUtcIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();

  cleanupExpiredEmployeeSessions(db);

  db.sqlite
    .prepare(
      `insert into employee_sessions (employee_id, session_token_hash, expires_at, created_at)
       values (?, ?, ?, ?)`
    )
    .run(employee.id, tokenHash, expiresAt, createdAt);

  return { token, expiresAt };
}

export async function getEmployeeSession(
  db: AppDb,
  token: string | undefined,
  sessionSecret: string
): Promise<EmployeeSession | null> {
  if (!token) {
    return null;
  }

  cleanupExpiredEmployeeSessions(db);

  const tokenHash = hashSessionToken(token, sessionSecret);
  const session = db.sqlite
    .prepare(
      `select
        employees.id as id,
        employees.login as login,
        employees.display_name as displayName
      from employee_sessions
      join employees on employees.id = employee_sessions.employee_id
      where employee_sessions.session_token_hash = ?
        and employee_sessions.expires_at > ?
        and employees.is_active = 1
      limit 1`
    )
    .get(tokenHash, nowUtcIso()) as EmployeeSession | undefined;

  return session ?? null;
}

export async function deleteEmployeeSession(
  db: AppDb,
  token: string | undefined,
  sessionSecret: string
): Promise<void> {
  if (!token) {
    return;
  }

  db.sqlite
    .prepare("delete from employee_sessions where session_token_hash = ?")
    .run(hashSessionToken(token, sessionSecret));
}

export async function upsertEmployee(
  db: AppDb,
  input: { login: string; displayName: string; password: string }
): Promise<EmployeeSession> {
  const now = nowUtcIso();
  const employee = db.sqlite
    .prepare(
      `insert into employees (login, password_hash, display_name, is_active, created_at, updated_at)
       values (?, ?, ?, 1, ?, ?)
       on conflict(login) do update set
         password_hash = excluded.password_hash,
         display_name = excluded.display_name,
         is_active = 1,
         updated_at = excluded.updated_at
       returning id, login, display_name as displayName`
    )
    .get(
      input.login.trim(),
      hashPassword(input.password),
      input.displayName.trim(),
      now,
      now
    ) as EmployeeSession;

  return employee;
}

function cleanupExpiredEmployeeSessions(db: AppDb): void {
  db.sqlite
    .prepare("delete from employee_sessions where expires_at <= ?")
    .run(nowUtcIso());
}
