import { z } from "zod";

export const childStatusValues = [
  "documents_accepted",
  "diagnostics_passed",
  "waiting_for_enrollment",
  "enrolled"
] as const;

export type ChildStatus = (typeof childStatusValues)[number];

export const childStatusSchema = z.enum(childStatusValues);

export const childStatusLabels: Record<ChildStatus, string> = {
  documents_accepted: "Документы приняты",
  diagnostics_passed: "Диагностика пройдена",
  waiting_for_enrollment: "Ожидание зачисления",
  enrolled: "Зачислен"
};

export const createChildSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО ребёнка."),
  iin: z.string().trim().min(1, "Укажите ИИН."),
  parentPhone: z.string().trim().min(1, "Укажите телефон родителя."),
  estimatedStartText: z.string().trim().max(120).optional().or(z.literal(""))
});

export type CreateChildInput = z.infer<typeof createChildSchema>;

export const archiveChildSchema = z.object({
  archivedByEmployeeId: z.number().int().positive().optional(),
  archiveReason: z.string().trim().max(240).optional().or(z.literal(""))
});

export type ArchiveChildInput = z.infer<typeof archiveChildSchema>;

export const publicStatusSchema = z.object({
  id: z.number().int().positive(),
  token: z.string().min(1),
  fullName: z.string(),
  status: childStatusSchema,
  statusLabel: z.string(),
  estimatedStartText: z.string().nullable(),
  queuePosition: z.number().int().positive().nullable(),
  familiesAhead: z.number().int().min(0).nullable()
});

export type PublicStatusView = z.infer<typeof publicStatusSchema>;

export function normalizeIin(value: string): string {
  return value.replace(/[\s-]+/g, "");
}

export function isValidIin(value: string): boolean {
  return /^\d{12}$/.test(normalizeIin(value));
}

