import type {
  Workout,
  WorkoutPerformance,
  WorkoutPerformanceBenchmark,
  WorkoutPerformanceSummary,
} from "../../api";
import WorkoutBadges from "./WorkoutBadges";
import { getWorkoutDisplayName } from "./workoutNames";

type MetricKey =
  | "effortSeconds"
  | "effortCount"
  | "durationSec"
  | "avgHeartRate"
  | "recoverySeconds"
  | "effortRecoveryRatio";

interface MetricDefinition {
  key: MetricKey;
  label: string;
  kicker: string;
  format: (value: number) => string;
  contributesToScore?: boolean;
  lowerIsBetter?: boolean;
}

const formatClock = (value: number) => {
  const totalSeconds = Math.round(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const METRICS: MetricDefinition[] = [
  {
    key: "effortSeconds",
    label: "Effort time",
    kicker: "Heart rate at or above 100 bpm",
    format: formatClock,
    contributesToScore: true,
  },
  {
    key: "effortCount",
    label: "Effort streaks",
    kicker: "30+ continuous seconds above 100",
    format: (value) => `${Math.round(value)}`,
    contributesToScore: true,
  },
  {
    key: "durationSec",
    label: "Session length",
    kicker: "Total workout duration",
    format: formatClock,
    contributesToScore: true,
  },
  {
    key: "avgHeartRate",
    label: "Average heart rate",
    kicker: "Sustained session intensity",
    format: (value) => `${Math.round(value)} bpm`,
    contributesToScore: true,
  },
  {
    key: "recoverySeconds",
    label: "Recovery time",
    kicker: "Heart rate below 100 bpm",
    format: formatClock,
    lowerIsBetter: true,
  },
  {
    key: "effortRecoveryRatio",
    label: "Effort / reset",
    kicker: "Effort streaks per 4+ minute reset",
    format: (value) => `${value.toFixed(1)}×`,
    contributesToScore: true,
  },
];

function isRecord(
  value: number | null,
  best: number | null,
  lowerIsBetter = false,
): boolean {
  if (value == null || best == null) return false;
  return lowerIsBetter
    ? value < best - Number.EPSILON
    : value > best + Number.EPSILON;
}

function metricScore(
  value: number | null,
  benchmark: WorkoutPerformanceBenchmark,
  lowerIsBetter = false,
): number | null {
  if (value == null || benchmark.monthlyBest == null) return null;
  if (benchmark.monthlyBest === 0) {
    return lowerIsBetter ? (value === 0 ? 100 : 0) : value > 0 ? 110 : 100;
  }
  const ratio = lowerIsBetter
    ? benchmark.monthlyBest / Math.max(value, Number.EPSILON)
    : value / benchmark.monthlyBest;
  return Math.min(115, ratio * 100);
}

function gradeFor(score: number | null): string {
  if (score == null) return "—";
  if (score >= 105) return "S";
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

function comparisonText(
  current: number | null,
  average: number | null,
): string | null {
  if (current == null || average == null || average === 0) return null;
  const difference = ((current - average) / average) * 100;
  if (Math.abs(difference) < 1) return "Right on your 30-day average";
  return `${Math.abs(Math.round(difference))}% ${difference > 0 ? "above" : "below"} your 30-day average`;
}

export default function PerformanceOverview({
  performance,
  workout,
}: {
  performance: WorkoutPerformance;
  workout: Workout;
}) {
  const scoredMetrics = METRICS.filter((metric) => metric.contributesToScore)
    .map((metric) =>
      metricScore(performance.current[metric.key], performance.benchmarks[metric.key]),
    )
    .filter((score): score is number => score != null);
  const overallScore =
    scoredMetrics.length > 0
      ? scoredMetrics.reduce((sum, score) => sum + score, 0) / scoredMetrics.length
      : null;
  const monthlyRecords = METRICS.filter((metric) =>
    isRecord(
      performance.current[metric.key],
      performance.benchmarks[metric.key].monthlyBest,
      metric.lowerIsBetter,
    ),
  );
  const weeklyRecords = METRICS.filter((metric) =>
    isRecord(
      performance.current[metric.key],
      performance.benchmarks[metric.key].weeklyBest,
      metric.lowerIsBetter,
    ),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/20">
      <div className="relative overflow-hidden border-b border-zinc-800 bg-[radial-gradient(circle_at_85%_10%,rgba(34,211,238,0.17),transparent_36%),linear-gradient(135deg,#18181b_15%,#111827_100%)] px-5 py-6 sm:px-7">
        <div className="pointer-events-none absolute -right-8 -top-16 h-48 w-48 rounded-full border-[32px] border-cyan-400/5" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
              Personal performance
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-white">
              Session report
            </h3>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">
              Ranked against earlier {getWorkoutDisplayName(workout)} workouts from
              the previous 7 and 30 days.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <WorkoutBadges workout={workout} />
              {monthlyRecords.length > 0 ? (
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
                  {monthlyRecords.length} new 30-day{" "}
                  {monthlyRecords.length === 1 ? "record" : "records"}
                </span>
              ) : performance.comparisonWorkoutCount === 0 ? (
                <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-3 py-1 text-xs font-medium text-zinc-300">
                  First 30-day baseline
                </span>
              ) : (
                <span className="rounded-full border border-zinc-700 bg-zinc-800/80 px-3 py-1 text-xs font-medium text-zinc-300">
                  {performance.comparisonWorkoutCount} comparison{" "}
                  {performance.comparisonWorkoutCount === 1 ? "workout" : "workouts"}
                </span>
              )}
              {weeklyRecords.length > 0 && monthlyRecords.length === 0 && (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-300">
                  {weeklyRecords.length} new weekly{" "}
                  {weeklyRecords.length === 1 ? "best" : "bests"}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-5xl font-black italic text-cyan-200 shadow-[inset_0_0_24px_rgba(34,211,238,0.08),0_0_24px_rgba(34,211,238,0.08)]">
              {gradeFor(overallScore)}
            </div>
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Performance grade
              </div>
              <div className="mt-0.5 text-xs text-zinc-400">
                {overallScore == null
                  ? "Awaiting benchmark data"
                  : `${Math.round(overallScore)}% of 30-day bests`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2">
        {METRICS.map((metric) => (
          <PerformanceMetric
            key={metric.key}
            definition={metric}
            current={performance.current}
            benchmark={performance.benchmarks[metric.key]}
          />
        ))}
      </div>

      <div className="border-t border-zinc-800 bg-zinc-950/40 px-5 py-3 text-xs text-zinc-500 sm:px-7">
        An effort streak is 30+ continuous seconds at 100 bpm or higher. A reset is
        4+ continuous minutes below 100 bpm. Gaps longer than 10 minutes are ignored.
      </div>
    </section>
  );
}

function PerformanceMetric({
  definition,
  current,
  benchmark,
}: {
  definition: MetricDefinition;
  current: WorkoutPerformanceSummary;
  benchmark: WorkoutPerformanceBenchmark;
}) {
  const value = current[definition.key];
  const score = metricScore(value, benchmark, definition.lowerIsBetter);
  const monthlyRecord = isRecord(
    value,
    benchmark.monthlyBest,
    definition.lowerIsBetter,
  );
  const weeklyRecord = isRecord(
    value,
    benchmark.weeklyBest,
    definition.lowerIsBetter,
  );
  const comparison = comparisonText(value, benchmark.monthlyAverage);
  const detail =
    definition.key === "effortRecoveryRatio" &&
    current.effortCount != null &&
    current.recoveryCount != null
      ? `${Math.round(current.effortCount)} ${
          Math.round(current.effortCount) === 1 ? "effort" : "efforts"
        } / ${Math.round(current.recoveryCount)} ${
          Math.round(current.recoveryCount) === 1 ? "reset" : "resets"
        }`
      : comparison;

  return (
    <article
      className={`relative min-w-0 border-zinc-800 p-5 even:border-t md:border-t [&:nth-child(n+3)]:border-t md:[&:nth-child(even)]:border-l ${
        monthlyRecord ? "bg-amber-400/[0.035]" : "bg-zinc-900"
      }`}
    >
      {monthlyRecord && (
        <div className="absolute right-4 top-4 rounded-full bg-amber-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-950">
          30d record
        </div>
      )}
      {!monthlyRecord && weeklyRecord && (
        <div className="absolute right-4 top-4 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-cyan-300">
          7d best
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-3xl font-black italic ${
            monthlyRecord
              ? "border-amber-300/50 bg-amber-300/10 text-amber-200"
              : "border-zinc-700 bg-zinc-800/80 text-zinc-300"
          }`}
        >
          {gradeFor(score)}
        </div>
        <div className="min-w-0 flex-1 pr-1">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
            {definition.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-white">
            {value == null ? "—" : definition.format(value)}
          </div>
          <div className="mt-1 truncate text-xs text-zinc-500">
            {detail ?? definition.kicker}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 border-t border-zinc-800 pt-3">
        <BenchmarkValue
          label="30d average"
          value={benchmark.monthlyAverage}
          format={definition.format}
        />
        <BenchmarkValue
          label="7d best"
          value={benchmark.weeklyBest}
          format={definition.format}
        />
        <BenchmarkValue
          label="30d best"
          value={benchmark.monthlyBest}
          format={definition.format}
        />
      </div>
      <div className="mt-3 text-[11px] text-zinc-600">{definition.kicker}</div>
    </article>
  );
}

function BenchmarkValue({
  label,
  value,
  format,
}: {
  label: string;
  value: number | null;
  format: (value: number) => string;
}) {
  return (
    <div className="min-w-0 border-l border-zinc-800 px-3 first:border-l-0 first:pl-0">
      <div className="truncate text-[9px] font-bold uppercase tracking-wider text-zinc-600">
        {label}
      </div>
      <div className="mt-1 truncate text-xs font-semibold tabular-nums text-zinc-300">
        {value == null ? "No data" : format(value)}
      </div>
    </div>
  );
}
