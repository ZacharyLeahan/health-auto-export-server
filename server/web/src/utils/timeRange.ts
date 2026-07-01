export type TimeRange = "1d" | "7d" | "30d" | "90d" | "1y";

export function daysFromRange(range_: TimeRange): number {
  switch (range_) {
    case "1d":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "1y":
      return 365;
  }
}

/** Format "2026-02-19" → "02/19". */
function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

/** Format date range label, e.g. "01/21 – 02/19". */
export function formatDateLabel(start: string, end: string): string {
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
