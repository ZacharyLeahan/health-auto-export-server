import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Workout } from "../../api";
import { formatUsDate, formatUsTime } from "../../utils/dateTime";
import { getWorkoutDisplayName, getWorkoutFilterKey } from "./workoutNames";
import WorkoutBadges from "./WorkoutBadges";

const PAGE_SIZE = 10;

interface Props {
  workouts: Workout[];
  allWorkouts: Workout[];
  typeFilter: string;
  onTypeFilter: (type: string) => void;
}

export default function WorkoutList({
  workouts,
  allWorkouts,
  typeFilter,
  onTypeFilter,
}: Props) {
  const [page, setPage] = useState(0);

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0);
  }, [typeFilter, workouts.length]);

  // Collect unique workout types from the full dataset so pills remain visible when filtered
  const types = [...new Set(allWorkouts.map((w) => getWorkoutFilterKey(w)))].sort();

  const totalPages = Math.ceil(workouts.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageWorkouts = workouts.slice(pageStart, pageEnd);
  const dailyTotals = new Map<
    string,
    { snacks: number; real: number; durationMinutes: number }
  >();
  for (const workout of workouts) {
    const date = formatUsDate(workout.StartTime, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const totals = dailyTotals.get(date) ?? {
      snacks: 0,
      real: 0,
      durationMinutes: 0,
    };
    if (workout.WorkoutScale === "real") {
      totals.real += 1;
    } else {
      totals.snacks += 1;
    }
    // Match the whole-minute value rendered in each workout row so the
    // visible durations always add up exactly to the daily summary.
    totals.durationMinutes += Math.floor(workout.DurationSec / 60);
    dailyTotals.set(date, totals);
  }

  return (
    <div className="space-y-4">
      {types.length > 1 && (
        <div className="flex flex-wrap gap-1 pb-1">
          <FilterPill
            label="All"
            active={typeFilter === ""}
            onClick={() => onTypeFilter("")}
          />
          {types.map((t) => (
            <FilterPill
              key={t}
              label={t}
              active={typeFilter === t}
              onClick={() => onTypeFilter(t)}
            />
          ))}
        </div>
      )}

      <WorkoutListView workouts={pageWorkouts} dailyTotals={dailyTotals} />

      {workouts.length === 0 && (
        <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded-lg">
          No workouts found in this time range.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-zinc-500">
            Showing {pageStart + 1}-{Math.min(pageEnd, workouts.length)} of{" "}
            {workouts.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                         bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                         bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAggregateDuration(minutes: number): string {
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)} hr`;
  return `${minutes} min`;
}

function WorkoutListView({
  workouts,
  dailyTotals,
}: {
  workouts: Workout[];
  dailyTotals: Map<
    string,
    { snacks: number; real: number; durationMinutes: number }
  >;
}) {
  // Group by date
  const groups: { date: string; workouts: Workout[] }[] = [];
  let currentDate = "";
  for (const w of workouts) {
    const d = formatUsDate(w.StartTime, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    if (d !== currentDate) {
      groups.push({ date: d, workouts: [w] });
      currentDate = d;
    } else {
      groups[groups.length - 1].workouts.push(w);
    }
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="flex items-center justify-between gap-3 bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-500">
            <span>{group.date}</span>
            <span className="tabular-nums text-zinc-600">
              {dailyTotals.get(group.date)?.snacks ?? 0}{" "}
              {(dailyTotals.get(group.date)?.snacks ?? 0) === 1 ? "snack" : "snacks"} ·{" "}
              {dailyTotals.get(group.date)?.real ?? 0} real ·{" "}
              {formatAggregateDuration(
                dailyTotals.get(group.date)?.durationMinutes ?? 0,
              )}
            </span>
          </div>
          {group.workouts.map((w) => (
            <Link
              key={w.ID}
              to={`/workouts/${w.ID}`}
              state={{ workout: w }}
              className="flex items-center gap-4 px-3 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-sm"
            >
              <span className="text-zinc-500 text-xs w-16 shrink-0">
                {formatUsTime(w.StartTime)}
              </span>
              <span className="text-zinc-100 font-medium min-w-0 truncate flex-1">
                {getWorkoutDisplayName(w)}
              </span>
              <WorkoutBadges workout={w} compact />
              <span className="text-zinc-400 tabular-nums shrink-0">
                {formatDuration(w.DurationSec)}
              </span>
              {w.AvgHeartRate != null && (
                <span className="text-zinc-400 tabular-nums shrink-0 hidden sm:inline">
                  {Math.round(w.AvgHeartRate)}
                  {w.MaxHeartRate != null && `/${Math.round(w.MaxHeartRate)}`} bpm
                </span>
              )}
              {w.ActiveEnergyBurned != null && (
                <span className="text-zinc-400 tabular-nums shrink-0 hidden sm:inline">
                  {Math.round(w.ActiveEnergyBurned)} kcal
                </span>
              )}
              {w.Distance != null && w.Distance > 0 && (
                <span className="text-zinc-400 tabular-nums shrink-0 hidden md:inline">
                  {w.Distance.toFixed(2)} {w.DistanceUnits}
                </span>
              )}
              {w.ElevationUp != null && w.ElevationUp > 0 && (
                <span className="text-zinc-400 tabular-nums shrink-0 hidden md:inline">
                  ↑{Math.round(w.ElevationUp)}m
                </span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-cyan-600 text-white"
          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}
