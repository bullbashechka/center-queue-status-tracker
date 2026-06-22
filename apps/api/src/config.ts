import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("./data/app.db"),
  CENTER_TIMEZONE: z.string().min(1).default("Asia/Almaty"),
  PUBLIC_APP_URL: z.string().url().default("http://localhost:5173"),
  API_PORT: z.coerce.number().int().positive().default(3001)
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | undefined;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = envSchema.parse(process.env);
  }

  return cachedConfig;
}

