import type { Workout } from "../../api";

interface Props {
  workout: Pick<
    Workout,
    "Name" | "DurationSec" | "WorkoutScale" | "HeatScore" | "HeatLabel"
  >;
  compact?: boolean;
}

export default function WorkoutBadges({ workout, compact = false }: Props) {
  const scale =
    workout.WorkoutScale ??
    (workout.DurationSec > 15 * 60 ? "real" : "snack");
  const heatScore = workout.HeatScore;
  const heatLabel = workout.HeatLabel;
  const showHeat = workout.Name !== "Flexibility";
  const padding = compact ? "px-2 py-0.5 text-[9px]" : "px-3 py-1 text-[10px]";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className={`${padding} rounded-full border font-black uppercase tracking-[0.12em] ${
          scale === "real"
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
            : "border-violet-400/30 bg-violet-400/10 text-violet-300"
        }`}
        title={
          scale === "real"
            ? "Real workout: longer than 15 minutes"
            : "Workout snack: 15 minutes or shorter"
        }
      >
        {scale === "real" ? "Real" : "Snack"}
      </span>

      {showHeat && heatScore != null && heatLabel && (
        <span
          className={`${padding} rounded-full border font-black uppercase tracking-[0.1em] ${
            heatScore === 0
              ? "border-sky-400/20 bg-sky-400/[0.07] text-sky-300"
              : heatScore === 1
                ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-300"
                : heatScore === 2
                  ? "border-orange-400/30 bg-orange-400/10 text-orange-300"
                  : "border-red-400/35 bg-red-400/10 text-red-300 shadow-[0_0_14px_rgba(248,113,113,0.12)]"
          }`}
          title="Cardiovascular heat based on average heart rate and sustained time above 100, 120, and 140 bpm"
        >
          <span aria-hidden="true">{heatScore === 0 ? "○" : "🔥"}</span>{" "}
          {heatLabel}
        </span>
      )}
    </div>
  );
}
