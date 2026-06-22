import {
  adminChildDetailSchema,
  adminChildListResponseSchema,
  changeChildStatusSchema,
  createChildSchema,
  employeeSessionSchema,
  loginInputSchema,
  publicStatusSchema,
  type AdminChildDetail,
  type AdminChildListItem,
  type ChildStatus,
  type EmployeeSession
} from "@queue-tracker/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type ApiError = {
  message: string;
};

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
  parser: { parse: (value: unknown) => T }
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: "Не удалось выполнить запрос." }))) as ApiError;

    if (response.status === 401) {
      throw new UnauthorizedError(error.message);
    }

    throw new ApiRequestError(error.message, response.status);
  }

  return parser.parse(await response.json());
}

async function requestWithoutBody<T>(
  path: string,
  parser: { parse: (value: unknown) => T },
  init?: RequestInit
): Promise<T> {
  return requestJson(path, init ?? {}, parser);
}

export async function fetchStatusByToken(token: string) {
  return requestWithoutBody(`/api/public/status/${token}`, publicStatusSchema);
}

export async function searchStatusByIin(iin: string) {
  return requestWithoutBody(
    `/api/public/search?iin=${encodeURIComponent(iin)}`,
    publicStatusSchema
  );
}

export async function loginEmployee(input: { login: string; password: string }) {
  const body = loginInputSchema.parse(input);
  return requestJson(
    "/api/auth/login",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    employeeSessionSchema
  );
}

export async function fetchCurrentEmployee() {
  return requestWithoutBody(
    "/api/auth/me",
    employeeSessionSchema,
    {
      credentials: "include"
    }
  );
}

export async function logoutEmployee(): Promise<void> {
  await requestJson(
    "/api/auth/logout",
    {
      method: "POST",
      credentials: "include"
    },
    {
      parse: () => undefined
    }
  );
}

export async function fetchAdminChildren(filters: {
  mode: "queue" | "enrolled";
  query: string;
  status: string;
}): Promise<AdminChildListItem[]> {
  const params = new URLSearchParams();
  params.set("mode", filters.mode);

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  const result = await requestWithoutBody(
    `/api/admin/children?${params.toString()}`,
    adminChildListResponseSchema,
    {
      credentials: "include"
    }
  );

  return result.items;
}

export async function fetchAdminChild(childId: number): Promise<AdminChildDetail> {
  return requestWithoutBody(
    `/api/admin/children/${childId}`,
    adminChildDetailSchema,
    {
      credentials: "include"
    }
  );
}

export async function createAdminChild(input: {
  fullName: string;
  iin: string;
  parentPhone: string;
  estimatedStartText?: string;
}): Promise<AdminChildDetail> {
  const body = createChildSchema.parse(input);
  return requestJson(
    "/api/admin/children",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    adminChildDetailSchema
  );
}

export async function updateAdminChild(
  childId: number,
  input: {
    fullName: string;
    iin: string;
    parentPhone: string;
    estimatedStartText?: string;
    expectedUpdatedAt: string;
  }
): Promise<AdminChildDetail> {
  return requestJson(
    `/api/admin/children/${childId}`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    },
    adminChildDetailSchema
  );
}

export async function archiveAdminChild(input: {
  childId: number;
  expectedUpdatedAt: string;
  archiveReason?: string;
}): Promise<void> {
  await requestJson(
    `/api/admin/children/${input.childId}/archive`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        expectedUpdatedAt: input.expectedUpdatedAt,
        archiveReason: input.archiveReason ?? ""
      })
    },
    {
      parse: () => undefined
    }
  );
}

export async function changeAdminChildStatus(input: {
  childId: number;
  status: ChildStatus;
  expectedUpdatedAt: string;
}): Promise<AdminChildDetail> {
  const body = changeChildStatusSchema.parse({
    status: input.status,
    expectedUpdatedAt: input.expectedUpdatedAt
  });

  return requestJson(
    `/api/admin/children/${input.childId}/status`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    adminChildDetailSchema
  );
}

export function buildPublicStatusUrl(token: string): string {
  return `${window.location.origin}/status/${token}`;
}

export type { AdminChildDetail, AdminChildListItem, EmployeeSession };
