import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchMoveWeekly, type MoveDay, type MoveHour, type MoveHourState } from '../api';
import { formatUsDate, formatUsTime } from '../utils/dateTime';

const stateClasses: Record<MoveHourState, string> = {
  protected: 'border-emerald-400/60 bg-emerald-500/25 text-emerald-100',
  missedStand: 'border-red-400/70 bg-red-500/25 text-red-100',
  snackOverdue: 'border-orange-400/70 bg-orange-500/25 text-orange-100',
  bothMissed:
    'border-red-500/80 bg-red-950/70 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]',
  future: 'border-zinc-800 bg-zinc-900/40 text-zinc-600',
};

function percent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function scoreLabel(status: 'strong' | 'watch' | 'stale'): string {
  if (status === 'strong') return 'Protected';
  if (status === 'watch') return 'Watch';
  return 'Stale';
}

function formatDurationFromNow(target: string): string {
  const minutes = Math.round((new Date(target).getTime() - Date.now()) / 60000);
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  const text = hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
  return minutes < 0 ? `${text} overdue` : text;
}

function CellGlyph({ hour }: { hour: MoveHour }) {
  if (hour.state === 'future') return <span className="text-zinc-700">.</span>;
  if (!hour.stood && !hour.snackCovered) return <span>!</span>;
  if (!hour.stood) return <span>S</span>;
  if (!hour.snackCovered) return <span>3h</span>;
  if (hour.snackWorkoutIds.length > 0) return <span>SK</span>;
  if (hour.workoutIds.length > 0) return <span>W</span>;
  return <span>OK</span>;
}

function MoveCell({ hour }: { hour: MoveHour }) {
  const title = [
    hour.label,
    hour.stood ? 'stood' : 'no stand',
    hour.snackCovered ? 'snack cadence covered' : 'snack cadence open',
    hour.workoutIds.length ? `${hour.workoutIds.length} workout marker` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <div
      title={title}
      className={`relative flex aspect-square min-h-10 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums transition-transform hover:scale-[1.04] ${stateClasses[hour.state]}`}
    >
      <CellGlyph hour={hour} />
      {hour.snackWorkoutIds.length > 0 && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
      )}
      {hour.workoutIds.length > 0 && (
        <span className="absolute bottom-1 left-1 h-1.5 w-1.5 rounded-full bg-blue-300" />
      )}
    </div>
  );
}

function DayRow({ day, today }: { day: MoveDay; today: boolean }) {
  const scorePercent = percent(day.score, day.maxScore);
  const tenseClass =
    scorePercent >= 78
      ? 'text-emerald-300'
      : scorePercent >= 55
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <div className="grid gap-2 border-t border-zinc-800 py-3 first:border-t-0 lg:grid-cols-[8.5rem_1fr_5.5rem] lg:items-center">
      <div className="flex items-center justify-between gap-3 lg:block">
        <div>
          <p className="text-sm font-semibold text-zinc-100">
            {today ? 'Today' : formatUsDate(`${day.date}T12:00:00`, { weekday: 'short' })}
          </p>
          <p className="text-xs text-zinc-500">
            {formatUsDate(`${day.date}T12:00:00`, { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <p className={`text-sm font-semibold tabular-nums lg:hidden ${tenseClass}`}>
          {day.score}/{day.maxScore}
        </p>
      </div>

      <div className="grid grid-cols-12 gap-1.5">
        {day.hours.map((hour) => (
          <MoveCell key={`${day.date}-${hour.hour}`} hour={hour} />
        ))}
      </div>

      <div className="hidden text-right lg:block">
        <p className={`text-sm font-semibold tabular-nums ${tenseClass}`}>
          {day.score}/{day.maxScore}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{day.standHours}/12 stand</p>
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: 'emerald' | 'amber' | 'red' | 'cyan';
}) {
  const classes = {
    emerald: 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200',
    amber: 'border-amber-500/30 bg-amber-950/20 text-amber-200',
    red: 'border-red-500/40 bg-red-950/25 text-red-200',
    cyan: 'border-cyan-500/30 bg-cyan-950/20 text-cyan-200',
  }[tone];

  return (
    <div className={`min-w-0 rounded-lg border p-2 sm:p-3 lg:p-4 ${classes}`}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] opacity-80 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums sm:text-2xl lg:text-3xl">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-zinc-400 sm:mt-1 sm:text-xs">{detail}</p>
    </div>
  );
}

function TodayRunway({ day }: { day: MoveDay }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-100">Today runway</h3>
          <p className="mt-1 text-sm text-zinc-500">8 AM to 8 PM movement coverage</p>
        </div>
        <p className="text-sm text-zinc-400">
          {day.snackBlocksMet}/4 snack blocks · {day.missedStandHours.length} missed stand
        </p>
      </div>

      <div className="mt-5 grid grid-cols-12 gap-1.5">
        {day.hours.map((hour) => (
          <div key={hour.hour} className="space-y-2">
            <MoveCell hour={hour} />
            <p className="text-center text-[10px] text-zinc-500">{hour.hour}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MovePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['move-weekly'],
    queryFn: fetchMoveWeekly,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="h-28 rounded-xl bg-zinc-900" />
        <div className="h-80 rounded-xl bg-zinc-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-5 text-red-200">
        Move data could not be loaded.
      </div>
    );
  }

  const today = data.days[0];
  const statusTone =
    data.score.status === 'strong' ? 'emerald' : data.score.status === 'watch' ? 'amber' : 'red';
  const nextSnackText = data.snackCadence.overdue
    ? formatDurationFromNow(data.snackCadence.nextSnackDue)
    : `due in ${formatDurationFromNow(data.snackCadence.nextSnackDue)}`;
  const latestSnack = data.snackCadence.latestSnackWorkout;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Move
            </p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-100 sm:text-2xl">
              {data.score.status === 'strong'
                ? 'Movement window is protected.'
                : data.score.status === 'watch'
                  ? 'Movement window needs attention.'
                  : 'Desk time is winning.'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              {today.longestMissedStandRun >= 3
                ? `${today.longestMissedStandRun} straight stand hours were missed.`
                : data.snackCadence.overdue
                  ? `Snack cadence is ${nextSnackText}.`
                  : latestSnack
                    ? `Last snack workout was ${formatUsTime(latestSnack.start)}.`
                    : 'No snack workout has started this movement window.'}
            </p>
          </div>

          <div className="min-w-32 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-right sm:min-w-40 sm:p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Today</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-100 sm:text-4xl">
              {data.score.today}
              <span className="text-base text-zinc-500">/{data.score.max}</span>
            </p>
            <p className="mt-1 text-sm text-zinc-400">{scoreLabel(data.score.status)}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
        <ScoreCard
          label="Rolling"
          value={`${data.score.rolling}/${data.score.max}`}
          detail={`${data.window.days}-day average`}
          tone="cyan"
        />
        <ScoreCard
          label="Snack"
          value={data.snackCadence.overdue ? 'Overdue' : nextSnackText}
          detail={
            latestSnack
              ? `${latestSnack.name} at ${formatUsTime(latestSnack.start)}`
              : 'No snack marker yet'
          }
          tone={data.snackCadence.overdue ? 'red' : statusTone}
        />
        <ScoreCard
          label="Stand"
          value={`${today.standHours}/12`}
          detail={
            today.missedStandHours.length
              ? `${today.missedStandHours.length} missed hour${
                  today.missedStandHours.length === 1 ? '' : 's'
                }`
              : 'All completed hours covered'
          }
          tone={
            today.missedStandHours.length >= 3
              ? 'red'
              : today.missedStandHours.length
                ? 'amber'
                : 'emerald'
          }
        />
        <ScoreCard
          label="Blocks"
          value={`${today.snackBlocksMet}/4`}
          detail={`${data.activeHours.snackCadenceHours}-hour snack cadence`}
          tone={today.snackBlocksMet >= 3 ? 'emerald' : today.snackBlocksMet >= 2 ? 'amber' : 'red'}
        />
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-100">Movement grid</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Stand coverage and snack cadence from 8 AM to 8 PM
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-emerald-300">OK</span>
            <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-300">3h</span>
            <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-300">Miss</span>
            <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-cyan-300">SK</span>
          </div>
        </div>

        <div className="mt-5 hidden grid-cols-[8.5rem_1fr_5.5rem] gap-2 text-xs text-zinc-500 lg:grid">
          <div />
          <div className="grid grid-cols-12 gap-1.5">
            {today.hours.map((hour) => (
              <p key={hour.hour} className="text-center">
                {hour.hour}
              </p>
            ))}
          </div>
          <div />
        </div>

        <div className="mt-2">
          {data.days.map((day, index) => (
            <DayRow key={day.date} day={day} today={index === 0} />
          ))}
        </div>
      </section>

      <TodayRunway day={today} />

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-zinc-100">Snack workouts</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Snack markers link back to workout detail when present.
            </p>
          </div>
          {latestSnack && (
            <Link
              to={`/workouts/${latestSnack.id}`}
              className="rounded-md bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
            >
              Latest snack
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
