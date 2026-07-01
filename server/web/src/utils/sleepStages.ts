import { SleepSession, SleepStage } from "../api";

const STAGE_ORDER = ["Deep", "Core", "REM", "Awake"] as const;

/** Build approximate stage blocks from nightly totals when segment timestamps are unavailable. */
export function buildProportionalSleepStages(
  session: SleepSession,
  awakeHours = 0,
): SleepStage[] {
  if (!session.SleepStart || !session.SleepEnd) return [];

  const start = new Date(session.SleepStart).getTime();
  const end = new Date(session.SleepEnd).getTime();
  const totalMs = end - start;
  if (totalMs <= 0) return [];

  const segments = [
    { stage: "Deep", hours: session.Deep },
    { stage: "Core", hours: session.Core },
    { stage: "REM", hours: session.REM },
    { stage: "Awake", hours: awakeHours },
  ].filter((segment) => segment.hours > 0);

  const totalHours = segments.reduce((sum, segment) => sum + segment.hours, 0);
  if (totalHours <= 0) return [];

  let cursor = start;
  return segments.map((segment) => {
    const segmentMs = (segment.hours / totalHours) * totalMs;
    const segmentStart = new Date(cursor);
    cursor += segmentMs;
    return {
      Stage: segment.stage,
      StartTime: segmentStart.toISOString(),
      EndTime: new Date(cursor).toISOString(),
      DurationHr: segment.hours,
      Source: "",
    };
  });
}

export function resolveSessionStages(
  session: SleepSession,
  stages: SleepStage[],
  awakeHours = 0,
): SleepStage[] {
  const sessionStart = new Date(session.SleepStart).getTime();
  const sessionEnd = new Date(session.SleepEnd).getTime();

  const timedStages = stages.filter((stage) => {
    const time = new Date(stage.StartTime).getTime();
    return time >= sessionStart && time < sessionEnd;
  });

  if (timedStages.length > 0) {
    return timedStages;
  }

  return buildProportionalSleepStages(session, awakeHours);
}

export function stageLegendStages(): string[] {
  return [...STAGE_ORDER];
}
