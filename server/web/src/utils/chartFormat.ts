import type uPlot from "uplot";
import { formatUsDate, formatUsTime } from "./dateTime";

/**
 * U.S. time axis formatter for uPlot.
 * Shows 12-hour time for sub-day tick spacing and month-first dates otherwise.
 */
export const axisValuesUs: uPlot.Axis.Values = (
  _u: uPlot,
  vals: number[]
): string[] =>
  vals.map((v) => {
    const d = new Date(v * 1000);
    const span = vals.length > 1 ? Math.abs(vals[1] - vals[0]) : 86400;
    if (span < 86400) {
      return formatUsTime(d);
    }
    return formatUsDate(d, {
      month: "short",
      day: "numeric",
    });
  });
