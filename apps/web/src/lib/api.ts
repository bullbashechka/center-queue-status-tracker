import { publicStatusSchema, type PublicStatusView } from "@queue-tracker/shared";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

type ApiError = {
  message: string;
};

export async function fetchStatusByToken(token: string): Promise<PublicStatusView> {
  const response = await fetch(`${apiBaseUrl}/api/public/status/${token}`);

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.message);
  }

  return publicStatusSchema.parse(await response.json());
}

export async function searchStatusByIin(iin: string): Promise<PublicStatusView> {
  const response = await fetch(
    `${apiBaseUrl}/api/public/search?iin=${encodeURIComponent(iin)}`
  );

  if (!response.ok) {
    const error = (await response.json()) as ApiError;
    throw new Error(error.message);
  }

  return publicStatusSchema.parse(await response.json());
}

