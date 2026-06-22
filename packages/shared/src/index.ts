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

export const adminChildListModeSchema = z.enum(["queue", "enrolled"]);

export type AdminChildListMode = z.infer<typeof adminChildListModeSchema>;

export const createChildSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО ребёнка."),
  iin: z
    .string()
    .trim()
    .min(1, "Укажите ИИН.")
    .refine(isValidIin, "Введите ИИН из 12 цифр."),
  parentPhone: z
    .string()
    .trim()
    .min(1, "Укажите телефон родителя.")
    .refine(isValidPhone, "Введите корректный телефон родителя."),
  estimatedStartText: z.string().trim().max(120).optional().or(z.literal(""))
});

export type CreateChildInput = z.infer<typeof createChildSchema>;

export const archiveChildSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  archivedByEmployeeId: z.number().int().positive().optional(),
  archiveReason: z.string().trim().max(240).optional().or(z.literal(""))
});

export type ArchiveChildInput = z.infer<typeof archiveChildSchema>;

export const updateChildSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО ребёнка."),
  iin: z
    .string()
    .trim()
    .min(1, "Укажите ИИН.")
    .refine(isValidIin, "Введите ИИН из 12 цифр."),
  parentPhone: z
    .string()
    .trim()
    .min(1, "Укажите телефон родителя.")
    .refine(isValidPhone, "Введите корректный телефон родителя."),
  estimatedStartText: z.string().trim().max(120).optional().or(z.literal("")),
  expectedUpdatedAt: z.string().datetime()
});

export type UpdateChildInput = z.infer<typeof updateChildSchema>;

export const changeChildStatusSchema = z.object({
  status: childStatusSchema,
  expectedUpdatedAt: z.string().datetime()
});

export type ChangeChildStatusInput = z.infer<typeof changeChildStatusSchema>;

export const loginInputSchema = z.object({
  login: z.string().trim().min(1, "Укажите логин."),
  password: z.string().min(1, "Укажите пароль.")
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const employeeSessionSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  displayName: z.string().min(1)
});

export type EmployeeSession = z.infer<typeof employeeSessionSchema>;

const adminChildBaseSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string().min(1),
  iin: z.string().min(1),
  parentPhone: z.string().min(1),
  estimatedStartText: z.string().nullable(),
  status: childStatusSchema,
  statusLabel: z.string().min(1),
  queuePosition: z.number().int().positive().nullable(),
  familiesAhead: z.number().int().min(0).nullable(),
  token: z.string().min(1),
  queuedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const adminChildListItemSchema = adminChildBaseSchema;

export type AdminChildListItem = z.infer<typeof adminChildListItemSchema>;

export const adminChildDetailSchema = adminChildBaseSchema.extend({
  lastNotificationMessage: z.string().nullable()
});

export type AdminChildDetail = z.infer<typeof adminChildDetailSchema>;

export const adminChildListResponseSchema = z.object({
  items: z.array(adminChildListItemSchema)
});

export type AdminChildListResponse = z.infer<typeof adminChildListResponseSchema>;

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

export function normalizePhone(value: string): string {
  const digitsOnly = value.replace(/\D+/g, "");

  if (digitsOnly.length === 11 && digitsOnly.startsWith("8")) {
    return `7${digitsOnly.slice(1)}`;
  }

  return digitsOnly;
}

export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return normalized.length >= 10 && normalized.length <= 15;
}
