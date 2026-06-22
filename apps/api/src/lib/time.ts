export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function centerLocalDate(iso: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date(iso));
}

export function formatCenterDateTime(iso: string, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return formatter.format(new Date(iso));
}
