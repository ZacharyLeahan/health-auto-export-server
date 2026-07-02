import type { CalendarDayActivity } from "../../utils/workoutCalendar";
import {
  formatActivityDuration,
  localDateKey,
  workoutTypeColor,
  workoutTypeMark,
} from "../../utils/workoutCalendar";

interface Props {
  months: Date[];
  activities: Map<string, CalendarDayActivity>;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function WorkoutCalendar({ months, activities }: Props) {
  const usedTypes = [...new Set([...activities.values()].map((activity) => activity.type))].sort();

  return (
    <div className="space-y-6">
      <div className="max-w-xl mx-auto space-y-6">
        {months.map((month) => (
          <div
            key={`${month.getFullYear()}-${month.getMonth()}`}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6"
          >
            <CalendarMonth month={month} activities={activities} />
          </div>
        ))}
      </div>

      {usedTypes.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-1">
          {usedTypes.map((type) => {
            const color = workoutTypeColor(type);
            return (
              <div key={type} className="flex items-center gap-2 text-xs text-zinc-400">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold"
                  style={{
                    backgroundColor: color.background,
                    borderColor: color.border,
                    color: color.foreground,
                  }}
                >
                  {workoutTypeMark(type)}
                </span>
                <span>{type}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarMonth({
  month,
  activities,
}: {
  month: Date;
  activities: Map<string, CalendarDayActivity>;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, monthIndex, index + 1)),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section>
      <h3 className="text-center text-sm font-medium text-zinc-200 mb-3">
        {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </h3>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((weekday, index) => (
          <div
            key={`${weekday}-${index}`}
            className="h-7 text-center text-[10px] font-medium text-zinc-600"
          >
            {weekday}
          </div>
        ))}
        {cells.map((date, index) =>
          date ? (
            <CalendarDay
              key={localDateKey(date)}
              date={date}
              activity={activities.get(localDateKey(date))}
            />
          ) : (
            <div key={`empty-${index}`} className="h-12" aria-hidden="true" />
          )
        )}
      </div>
    </section>
  );
}

function CalendarDay({
  date,
  activity,
}: {
  date: Date;
  activity?: CalendarDayActivity;
}) {
  const today = localDateKey(new Date());
  const dateKey = localDateKey(date);
  const isToday = dateKey === today;
  const isFuture = date.getTime() > Date.now();
  const color = activity ? workoutTypeColor(activity.type) : null;
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const title = activity
    ? `${label}: ${activity.type}, ${formatActivityDuration(activity.durationSec)}`
    : label;

  return (
    <div className="h-12 flex items-center justify-center">
      {activity && color ? (
        <div
          className="h-9 w-9 rounded-full border flex flex-col items-center justify-center leading-none"
          style={{
            backgroundColor: color.background,
            borderColor: color.border,
            color: color.foreground,
          }}
          title={title}
          aria-label={title}
        >
          <span className="text-[9px] font-bold">{workoutTypeMark(activity.type)}</span>
          <span className="text-[8px] mt-0.5 opacity-80">{date.getDate()}</span>
        </div>
      ) : (
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center text-xs ${
            isToday
              ? "border border-cyan-700 text-cyan-300"
              : isFuture
                ? "text-zinc-800"
                : "text-zinc-600"
          }`}
          title={title}
          aria-label={title}
        >
          {date.getDate()}
        </div>
      )}
    </div>
  );
}
