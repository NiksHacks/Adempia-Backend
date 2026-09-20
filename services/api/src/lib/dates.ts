const ROME = "Europe/Rome";

export function formatItDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatItDateTime(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function toAlloggiatiDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  return `${day}/${month}/${year}`;
}

export function todayInRome(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseDateOnly(iso);
}

export function parseDateOnly(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}
