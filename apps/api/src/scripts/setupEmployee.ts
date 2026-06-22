import { bootstrapDatabase } from "../db/bootstrap.js";
import { createDb, createSqlite } from "../db/client.js";
import { upsertEmployee } from "../domain/auth.js";
import { getConfig } from "../config.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const login = args.get("login");
  const displayName = args.get("name") ?? args.get("display-name");
  const password = args.get("password");

  if (!login || !displayName || !password) {
    throw new Error("Используйте --login, --name и --password.");
  }

  const config = getConfig();
  const sqlite = createSqlite(config.DATABASE_URL);
  bootstrapDatabase(sqlite);
  const employee = await upsertEmployee(createDb(sqlite), {
    login,
    displayName,
    password
  });

  console.log(`Сотрудник готов: ${employee.login} (${employee.displayName})`);
}

function parseArgs(args: string[]): Map<string, string> {
  const result = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (!token?.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Не указано значение для --${key}.`);
    }

    result.set(key, value);
    index += 1;
  }

  return result;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
