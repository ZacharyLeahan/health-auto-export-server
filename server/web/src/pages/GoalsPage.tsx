import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatUsDate, formatUsTime } from "../utils/dateTime";

interface GoalWorkout {
  id: string;
  name: string;
  start: string;
  durationSeconds: number;
  category: "lifting" | "flexibility" | "cardio";
  qualifiesForLifting: boolean;
  qualifiesForFlexibility: boolean;
  elevatedHeartRateSeconds: number;
  heartRateTrackedSeconds: number;
}

interface WeeklyGoals {
  generatedAt: string;
  window: { start: string; end: string; days: number };
  lifting: {
    qualifyingSessions: number;
    targetSessions: number;
    stretchTargetSessions: number;
    minimumSessionSeconds: number;
    met: boolean;
    stretchMet: boolean;
  };
  flexibility: {
    qualifyingSessions: number;
    targetSessions: number;
    minimumSessionSeconds: number;
    met: boolean;
  };
  cardio: {
    workoutSeconds: number;
    elevatedHeartRateSeconds: number;
    heartRateTrackedSeconds: number;
    targetSeconds: number;
    workoutTimeMet: boolean;
    elevatedHeartRateMet: boolean;
  };
  elevatedHeartRate: {
    thresholdBpm: number;
    restingMedianBpm: number | null;
    calibrationDays: number;
    method: string;
    maximumSampleGapSeconds: number;
  };
  workouts: GoalWorkout[];
}

async function fetchWeeklyGoals(): Promise<WeeklyGoals> {
  const response = await fetch("/dashboard/api/v1/goals/weekly");
  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }
  return response.json();
}

function minutes(seconds: number): number {
  return Math.round(seconds / 60);
}

function formatDuration(seconds: number): string {
  const totalMinutes = minutes(seconds);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remainder = totalMinutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatMinutesAndSeconds(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  const wholeMinutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${wholeMinutes}:${remainder.toString().padStart(2, "0")}`;
}

function ProgressBar({
  value,
  target,
  met,
}: {
  value: number;
  target: number;
  met: boolean;
}) {
  const percent = Math.min(100, Math.max(0, (value / target) * 100));
  return (
    <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
      <div
        className={`h-full rounded-full transition-all ${
          met ? "bg-emerald-500" : "bg-amber-500"
        }`}
        style={{ width: `${percent}%` }}
      />
      <div className="absolute right-0 top-0 h-full w-0.5 bg-zinc-100/80" />
    </div>
  );
}

function LiftingGauge({
  value,
  baselineTarget,
  stretchTarget,
}: {
  value: number;
  baselineTarget: number;
  stretchTarget: number;
}) {
  const baselineMet = value >= baselineTarget;
  const stretchMet = value >= stretchTarget;
  const fillPercent = Math.min(100, (value / stretchTarget) * 100);
  const baselinePercent = (baselineTarget / stretchTarget) * 100;
  const fillColor = stretchMet
    ? "bg-cyan-400"
    : baselineMet
      ? "bg-emerald-500"
      : "bg-amber-500";
  const status = stretchMet
    ? "Stretch goal reached"
    : baselineMet
      ? `${stretchTarget - value} more reaches stretch`
      : `${baselineTarget - value} more to baseline`;

  return (
    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-3xl font-semibold tabular-nums text-zinc-100">
          {value}
          <span className="text-base font-medium text-zinc-500">
            {" "}
            / {stretchTarget} sessions
          </span>
        </p>
        <StatusPill
          met={baselineMet}
          metLabel={stretchMet ? "Stretch met" : "Baseline met"}
          unmetLabel="Building baseline"
        />
      </div>

      <div className="relative mt-6">
        <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all ${fillColor}`}
            style={{ width: `${fillPercent}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-zinc-100/80"
            style={{ left: `${baselinePercent}%` }}
          />
          <div className="absolute right-0 top-0 h-full w-0.5 bg-cyan-300/90" />
        </div>

        <div className="relative mt-2 h-5 text-xs font-medium">
          <span
            className={`absolute -translate-x-1/2 ${
              baselineMet ? "text-emerald-300" : "text-zinc-500"
            }`}
            style={{ left: `${baselinePercent}%` }}
          >
            Baseline {baselineTarget}
          </span>
          <span
            className={`absolute right-0 ${
              stretchMet ? "text-cyan-300" : "text-cyan-600"
            }`}
          >
            Stretch {stretchTarget}
          </span>
        </div>
      </div>

      <p className="mt-1 text-xs text-zinc-500">{status}</p>
    </div>
  );
}

function StatusPill({
  met,
  metLabel = "Goal met",
  unmetLabel = "Needs attention",
}: {
  met: boolean;
  metLabel?: string;
  unmetLabel?: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        met
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-amber-500/15 text-amber-300"
      }`}
    >
      {met ? metLabel : unmetLabel}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-24 rounded-xl bg-zinc-900" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-xl bg-zinc-900" />
        <div className="h-64 rounded-xl bg-zinc-900" />
      </div>
    </div>
  );
}

export default function GoalsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["weekly-fitness-goals"],
    queryFn: fetchWeeklyGoals,
    refetchInterval: 60_000,
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-5 text-sm text-red-300">
        Weekly goals could not be loaded.
      </div>
    );
  }

  const primaryGoalsMet =
    data.lifting.met &&
    data.flexibility.met &&
    data.cardio.elevatedHeartRateMet;
  const liftingWorkouts = data.workouts.filter(
    (workout) => workout.category === "lifting",
  );
  const cardioWorkouts = data.workouts.filter(
    (workout) => workout.category === "cardio",
  );
  const flexibilityWorkouts = data.workouts.filter(
    (workout) => workout.category === "flexibility",
  );
  const remainingLifts = Math.max(
    0,
    data.lifting.targetSessions - data.lifting.qualifyingSessions,
  );
  const remainingElevatedMinutes = Math.max(
    0,
    minutes(
      data.cardio.targetSeconds - data.cardio.elevatedHeartRateSeconds,
    ),
  );
  const remainingFlexibility = Math.max(
    0,
    data.flexibility.targetSessions -
      data.flexibility.qualifyingSessions,
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
              Rolling {data.window.days}-day snapshot
            </p>
            <h2 className="text-2xl font-semibold text-zinc-100">
              {primaryGoalsMet
                ? "You’re on plan."
                : "Today can move the plan forward."}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              {primaryGoalsMet
                ? "Lifting, flexibility, and measured elevated-heart-rate time are all at or above target."
                : [
                    remainingLifts > 0
                      ? `${remainingLifts} qualifying lift${remainingLifts === 1 ? "" : "s"} remaining`
                      : null,
                    remainingFlexibility > 0
                      ? `${remainingFlexibility} qualifying flexibility session${remainingFlexibility === 1 ? "" : "s"} remaining`
                      : null,
                    remainingElevatedMinutes > 0
                      ? `${remainingElevatedMinutes} elevated-heart-rate minutes remaining`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </div>
          <StatusPill met={primaryGoalsMet} />
        </div>
        <p className="mt-5 text-xs text-zinc-500">
          {formatUsDate(data.window.start, {
            month: "short",
            day: "numeric",
          })}{" "}
          {formatUsTime(data.window.start)} through now
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div>
            <h3 className="font-semibold text-zinc-100">Lifting</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Sessions of at least 20 minutes count.
            </p>
          </div>

          <LiftingGauge
            value={data.lifting.qualifyingSessions}
            baselineTarget={data.lifting.targetSessions}
            stretchTarget={data.lifting.stretchTargetSessions}
          />

          <div className="mt-6 space-y-2">
            {liftingWorkouts.length === 0 ? (
              <p className="rounded-lg bg-zinc-950/60 p-3 text-sm text-zinc-500">
                No lifting workouts in this rolling window.
              </p>
            ) : (
              liftingWorkouts.map((workout) => (
                <Link
                  key={workout.id}
                  to={`/workouts/${workout.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 p-3 transition-colors hover:bg-zinc-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-200">
                      {workout.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatUsDate(workout.start, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      workout.qualifiesForLifting
                        ? "text-emerald-300"
                        : "text-amber-300"
                    }`}
                  >
                    {formatMinutesAndSeconds(workout.durationSeconds)}
                    {!workout.qualifiesForLifting && (
                      <span className="ml-1 text-xs text-zinc-500">
                        under 20 min
                      </span>
                    )}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-400">
                Elevated heart rate
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-100">
                {minutes(data.cardio.elevatedHeartRateSeconds)}
                <span className="text-lg text-zinc-500">
                  {" "}
                  / {minutes(data.cardio.targetSeconds)} min
                </span>
              </p>
            </div>
            <StatusPill met={data.cardio.elevatedHeartRateMet} />
          </div>
          <div className="mt-5">
            <ProgressBar
              value={data.cardio.elevatedHeartRateSeconds}
              target={data.cardio.targetSeconds}
              met={data.cardio.elevatedHeartRateMet}
            />
            <div className="mt-2 flex justify-between text-xs text-zinc-500">
              <span>At or above {data.elevatedHeartRate.thresholdBpm} BPM</span>
              <span>Target: 90 min</span>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  Cardio workout time
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-200">
                  {minutes(data.cardio.workoutSeconds)} min
                </p>
              </div>
              <StatusPill met={data.cardio.workoutTimeMet} />
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              All workout types except lifting and flexibility. This is the
              schedule-based proxy; measured heart-rate time above is the
              primary cardio goal.
            </p>
          </div>

          <details className="mt-4 rounded-lg border border-zinc-800 p-3 text-xs text-zinc-500">
            <summary className="cursor-pointer font-medium text-zinc-400">
              How the heart-rate threshold works
            </summary>
            <p className="mt-2 leading-5">
              {data.elevatedHeartRate.method}. Recent resting median:{" "}
              {data.elevatedHeartRate.restingMedianBpm == null
                ? "unavailable"
                : `${Math.round(data.elevatedHeartRate.restingMedianBpm)} BPM`}{" "}
              from {data.elevatedHeartRate.calibrationDays} daily values.
              Sensor gaps over {data.elevatedHeartRate.maximumSampleGapSeconds}{" "}
              seconds are excluded.
            </p>
          </details>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-400">Flexibility</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-100">
              {data.flexibility.qualifyingSessions}
              <span className="text-lg text-zinc-500">
                {" "}
                / {data.flexibility.targetSessions} sessions
              </span>
            </p>
          </div>
          <StatusPill met={data.flexibility.met} />
        </div>
        <div className="mt-5">
          <ProgressBar
            value={data.flexibility.qualifyingSessions}
            target={data.flexibility.targetSessions}
            met={data.flexibility.met}
          />
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>Only sessions over 20 minutes count</span>
            <span>Target: 5</span>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {flexibilityWorkouts.length === 0 ? (
            <p className="rounded-lg bg-zinc-950/60 p-3 text-sm text-zinc-500">
              No flexibility workouts in this rolling window.
            </p>
          ) : (
            flexibilityWorkouts.map((workout) => (
              <Link
                key={workout.id}
                to={`/workouts/${workout.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 p-3 transition-colors hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {workout.name}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatUsDate(workout.start, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm tabular-nums ${
                    workout.qualifiesForFlexibility
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {formatMinutesAndSeconds(workout.durationSeconds)}
                  {!workout.qualifiesForFlexibility && (
                    <span className="ml-1 text-xs text-zinc-500">
                      not over 20 min
                    </span>
                  )}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold text-zinc-100">
              Cardio contribution
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              Workouts included in the rolling cardio-time proxy.
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            {minutes(data.cardio.heartRateTrackedSeconds)} min with usable
            heart-rate coverage
          </p>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cardioWorkouts.map((workout) => (
            <Link
              key={workout.id}
              to={`/workouts/${workout.id}`}
              className="rounded-lg bg-zinc-950/60 p-3 transition-colors hover:bg-zinc-800"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate text-sm font-medium text-zinc-200">
                  {workout.name}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                  {formatDuration(workout.durationSeconds)}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-xs text-zinc-500">
                <span>
                  {formatUsDate(workout.start, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span>
                  {minutes(workout.elevatedHeartRateSeconds)} min elevated
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
