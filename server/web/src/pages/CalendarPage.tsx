import { useQuery } from "@tanstack/react-query";
import { fetchWorkouts } from "../api";
import WorkoutCalendar from "../components/calendar/WorkoutCalendar";
import {
  aggregatePrimaryActivities,
  localDateKey,
} from "../utils/workoutCalendar";

const MONTHS_TO_CHECK = 12;

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export default function CalendarPage() {
  const currentMonth = firstOfMonth(new Date());
  const oldestMonth = addMonths(currentMonth, -(MONTHS_TO_CHECK - 1));
  const candidateMonths = Array.from(
    { length: MONTHS_TO_CHECK },
    (_, index) => addMonths(currentMonth, -index)
  );
  const rangeEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

  // Query one additional day because the API interprets date-only end values as
  // UTC while calendar dates are grouped in the browser's local time zone.
  const apiEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1);
  const start = localDateKey(oldestMonth);
  const end = localDateKey(apiEnd);

  const { data, isLoading, error } = useQuery({
    queryKey: ["calendar-workouts", start, end],
    queryFn: () => fetchWorkouts(start, end),
  });

  const workouts = (data ?? []).filter((workout) => {
    const dateKey = localDateKey(workout.StartTime);
    return dateKey >= localDateKey(oldestMonth) && dateKey <= localDateKey(rangeEnd);
  });
  const activities = aggregatePrimaryActivities(workouts);
  const monthsWithData = new Set(
    workouts.map((workout) => localDateKey(workout.StartTime).slice(0, 7))
  );
  const visibleMonths = candidateMonths.filter((month) =>
    monthsWithData.has(localDateKey(month).slice(0, 7))
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Activity Calendar</h2>
        <p className="text-sm text-zinc-500 mt-1">
          The longest workout type each day earns a badge when its total exceeds 15 minutes.
          Showing months with workout data from the past year.
        </p>
      </div>

      {isLoading ? (
        <div className="h-[560px] bg-zinc-900 rounded-xl animate-pulse" />
      ) : error ? (
        <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded-lg">
          Failed to load workout calendar.
        </div>
      ) : visibleMonths.length === 0 ? (
        <div className="text-zinc-500 text-sm p-4 bg-zinc-900 rounded-lg">
          No workout data found in the past year.
        </div>
      ) : (
        <WorkoutCalendar months={visibleMonths} activities={activities} />
      )}
    </div>
  );
}
