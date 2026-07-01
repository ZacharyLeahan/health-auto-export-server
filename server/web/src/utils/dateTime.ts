const US_LOCALE = "en-US";

type DateValue = string | number | Date;

function toDate(value: DateValue): Date {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return value instanceof Date ? value : new Date(value);
}

export function formatUsDate(
  value: DateValue,
  options: Intl.DateTimeFormatOptions
): string {
  return toDate(value).toLocaleDateString(US_LOCALE, options);
}

export function formatUsTime(value: DateValue): string {
  return toDate(value).toLocaleTimeString(US_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatUsHour(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(US_LOCALE, {
    hour: "numeric",
    hour12: true,
  });
}

export function formatUsDateTime(value: DateValue): string {
  return toDate(value).toLocaleString(US_LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
