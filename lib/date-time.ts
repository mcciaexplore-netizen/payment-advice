export const IST_TIME_ZONE = "Asia/Kolkata";

const istDateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function istCalendarParts(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(
    istDateParts.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export function todayInIst(now: Date = new Date()) {
  const { year, month, day } = istCalendarParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Formats a PostgreSQL `date` value without converting it through a timezone. */
export function formatDateOnly(value: string | null | undefined) {
  if (!value) return "—";
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

export function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function calendarDayOfWeek(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function calendarDaysBetween(start: string, end: string) {
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

export function formatDateOnlyShort(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatIstDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value instanceof Date ? value : new Date(value));
}

export function formatIstDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(value instanceof Date ? value : new Date(value));
}
