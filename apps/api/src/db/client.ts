import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqliteDatabase = DatabaseSync;
export type AppDb = {
  sqlite: DatabaseSync;
};

export function ensureDatabaseDir(databaseUrl: string): string {
  const absolutePath = path.isAbsolute(databaseUrl)
    ? databaseUrl
    : path.resolve(process.cwd(), databaseUrl);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export function createSqlite(databaseUrl: string): SqliteDatabase {
  const absolutePath = ensureDatabaseDir(databaseUrl);
  const sqlite = new DatabaseSync(absolutePath);
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  return sqlite;
}

export function createDb(sqlite: SqliteDatabase) {
  return { sqlite };
}

export function runInTransaction<T>(db: AppDb, callback: () => T): T {
  db.sqlite.exec("BEGIN");

  try {
    const result = callback();
    db.sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    db.sqlite.exec("ROLLBACK");
    throw error;
  }
}
