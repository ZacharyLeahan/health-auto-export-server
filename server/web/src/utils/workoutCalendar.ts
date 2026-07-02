import type { Workout } from "../api";
import { getWorkoutFilterKey } from "../components/workouts/workoutNames";

export const BADGE_MIN_DURATION_SEC = 15 * 60;

export interface CalendarDayActivity {
  dateKey: string;
  type: string;
  durationSec: number;
}

const BADGE_COLORS = [
  { background: "#164e63", foreground: "#67e8f9", border: "#155e75" },
  { background: "#3b0764", foreground: "#d8b4fe", border: "#581c87" },
  { background: "#4c0519", foreground: "#fda4af", border: "#881337" },
  { background: "#422006", foreground: "#fcd34d", border: "#713f12" },
  { background: "#052e16", foreground: "#86efac", border: "#14532d" },
  { background: "#172554", foreground: "#93c5fd", border: "#1e3a8a" },
  { background: "#431407", foreground: "#fdba74", border: "#7c2d12" },
  { background: "#27272a", foreground: "#d4d4d8", border: "#52525b" },
] as const;

export function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function aggregatePrimaryActivities(
  workouts: Workout[]
): Map<string, CalendarDayActivity> {
  const totals = new Map<string, Map<string, number>>();

  for (const workout of workouts) {
    const dateKey = localDateKey(workout.StartTime);
    const type = getWorkoutFilterKey(workout);
    const typeTotals = totals.get(dateKey) ?? new Map<string, number>();
    typeTotals.set(type, (typeTotals.get(type) ?? 0) + workout.DurationSec);
    totals.set(dateKey, typeTotals);
  }

  const primaryByDay = new Map<string, CalendarDayActivity>();

  for (const [dateKey, typeTotals] of totals) {
    const winner = [...typeTotals.entries()].sort(
      ([typeA, durationA], [typeB, durationB]) =>
        durationB - durationA || typeA.localeCompare(typeB)
    )[0];

    if (winner && winner[1] > BADGE_MIN_DURATION_SEC) {
      primaryByDay.set(dateKey, {
        dateKey,
        type: winner[0],
        durationSec: winner[1],
      });
    }
  }

  return primaryByDay;
}

export function workoutTypeMark(type: string): string {
  const words = type
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function workoutTypeColor(type: string): (typeof BADGE_COLORS)[number] {
  let hash = 0;
  for (let index = 0; index < type.length; index += 1) {
    hash = (hash * 31 + type.charCodeAt(index)) | 0;
  }
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

export function formatActivityDuration(durationSec: number): string {
  const minutes = Math.round(durationSec / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}
