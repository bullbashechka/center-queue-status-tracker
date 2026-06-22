import { randomBytes } from "node:crypto";

export function generatePublicToken(): string {
  return randomBytes(24).toString("hex");
}

