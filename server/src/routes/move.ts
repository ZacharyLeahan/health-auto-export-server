import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { WorkoutModel } from '../models/Workout';
import { getWorkoutScale } from '../utils/workoutClassification';

const router = Router();

const TIME_ZONE = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_DAYS = 7;
const ACTIVE_START_HOUR = 8;
const ACTIVE_END_HOUR = 20;
const SNACK_CADENCE_HOURS = 3;

type MoveHourState = 'protected' | 'missedStand' | 'snackOverdue' | 'bothMissed' | 'future';
type MoveScoreStatus = 'strong' | 'watch' | 'stale';

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const localFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function getLocalParts(date: Date): LocalParts {
  const parts = Object.fromEntries(
    localFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(parts.minute),
  };
}

function localDateKey(date: Date): string {
  const parts = getLocalParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(
    2,
    '0',
  )}`;
}

function localHourKey(date: Date): string {
  const parts = getLocalParts(date);
  return `${localDateKey(date)}:${String(parts.hour).padStart(2, '0')}`;
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function localDateTimeToUtc(dateKey: string, hour: number, minute = 0): Date {
  const desired = parseDateKey(dateKey);
  let candidate = new Date(Date.UTC(desired.year, desired.month - 1, desired.day, hour, minute));

  for (let index = 0; index < 4; index += 1) {
    const actual = getLocalParts(candidate);
    const desiredMinutes = Date.UTC(desired.year, desired.month - 1, desired.day, hour, minute);
    const actualMinutes = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const diffMinutes = (desiredMinutes - actualMinutes) / 60000;
    if (diffMinutes === 0) break;
    candidate = new Date(candidate.getTime() + diffMinutes * 60000);
  }

  return candidate;
}

function buildDayKeys(now: Date): string[] {
  const todayNoon = localDateTimeToUtc(localDateKey(now), 12);
  return Array.from({ length: ROLLING_DAYS }, (_value, index) =>
    localDateKey(new Date(todayNoon.getTime() - index * DAY_MS)),
  );
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

function isFutureHour(dateKey: string, hour: number, now: Date): boolean {
  return localDateTimeToUtc(dateKey, hour).getTime() > now.getTime();
}

function overlaps(start: Date, end: Date, slotStart: Date, slotEnd: Date): boolean {
  return start.getTime() < slotEnd.getTime() && end.getTime() > slotStart.getTime();
}

function stateFor(stood: boolean, snackCovered: boolean, future: boolean): MoveHourState {
  if (future) return 'future';
  if (stood && snackCovered) return 'protected';
  if (stood) return 'snackOverdue';
  if (snackCovered) return 'missedStand';
  return 'bothMissed';
}

router.get('/move/weekly', async (_req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    const now = new Date();
    const dayKeys = buildDayKeys(now);
    const oldestDay = dayKeys[dayKeys.length - 1];
    const newestDay = dayKeys[0];
    const queryStart = localDateTimeToUtc(oldestDay, ACTIVE_START_HOUR - SNACK_CADENCE_HOURS);
    const queryEnd = localDateTimeToUtc(newestDay, ACTIVE_END_HOUR, 59);

    const [standHourRecords, standTimeRecords, workouts] = await Promise.all([
      db
        ? db
            .collection('apple_stand_hour')
            .find({ date: { $gte: queryStart, $lte: queryEnd } })
            .project({ date: 1, qty: 1 })
            .toArray()
        : [],
      db
        ? db
            .collection('apple_stand_time')
            .find({ date: { $gte: queryStart, $lte: queryEnd } })
            .project({ date: 1, qty: 1 })
            .toArray()
        : [],
      WorkoutModel.find({
        start: { $lte: queryEnd },
        end: { $gte: queryStart },
      })
        .sort({ start: 1 })
        .lean(),
    ]);

    const stoodHours = new Set<string>();
    for (const record of [...standHourRecords, ...standTimeRecords]) {
      if (typeof record.qty === 'number' && record.qty > 0 && record.date) {
        const key = localHourKey(new Date(record.date));
        const hour = Number(key.slice(-2));
        if (hour >= ACTIVE_START_HOUR && hour < ACTIVE_END_HOUR) stoodHours.add(key);
      }
    }

    const workoutRows = workouts.map((workout) => ({
      id: workout.workoutId,
      name: workout.name,
      start: new Date(workout.start),
      end: new Date(workout.end),
      durationSeconds: workout.duration,
      workoutScale: getWorkoutScale(workout.duration),
    }));
    const snackWorkouts = workoutRows.filter((workout) => workout.workoutScale === 'snack');
    const realWorkouts = workoutRows.filter((workout) => workout.workoutScale === 'real');

    const days = dayKeys.map((dateKey) => {
      const hours = [];
      const snackBlocks = [
        [8, 11],
        [11, 14],
        [14, 17],
        [17, 20],
      ] as const;
      let stoodCount = 0;
      let snackCoveredCount = 0;
      let longestMissedStandRun = 0;
      let currentMissedStandRun = 0;
      let futureCount = 0;

      for (let hour = ACTIVE_START_HOUR; hour < ACTIVE_END_HOUR; hour += 1) {
        const slotStart = localDateTimeToUtc(dateKey, hour);
        const slotEnd = localDateTimeToUtc(dateKey, hour + 1);
        const cadenceStart = new Date(slotEnd.getTime() - SNACK_CADENCE_HOURS * 60 * 60 * 1000);
        const future = isFutureHour(dateKey, hour, now);
        const stood = stoodHours.has(`${dateKey}:${String(hour).padStart(2, '0')}`);
        const hourSnackWorkouts = snackWorkouts.filter(
          (workout) => workout.start >= cadenceStart && workout.start <= slotEnd,
        );
        const hourWorkouts = workoutRows.filter((workout) =>
          overlaps(workout.start, workout.end, slotStart, slotEnd),
        );
        const snackCovered = hourSnackWorkouts.length > 0;

        if (future) futureCount += 1;
        if (!future && stood) stoodCount += 1;
        if (!future && snackCovered) snackCoveredCount += 1;
        if (!future && !stood) {
          currentMissedStandRun += 1;
          longestMissedStandRun = Math.max(longestMissedStandRun, currentMissedStandRun);
        } else if (!future) {
          currentMissedStandRun = 0;
        }

        hours.push({
          hour,
          label: hourLabel(hour),
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          stood,
          snackCovered,
          snackWorkoutIds: hourSnackWorkouts.map((workout) => workout.id),
          workoutIds: hourWorkouts.map((workout) => workout.id),
          state: stateFor(stood, snackCovered, future),
        });
      }

      const snackBlocksMet = snackBlocks.filter(([startHour, endHour]) => {
        const start = localDateTimeToUtc(dateKey, startHour);
        const end = localDateTimeToUtc(dateKey, endHour);
        return snackWorkouts.some((workout) => workout.start >= start && workout.start < end);
      }).length;
      const realWorkoutBonus = Math.min(
        4,
        realWorkouts.filter((workout) => localDateKey(workout.start) === dateKey).length * 2,
      );
      const completedHours = ACTIVE_END_HOUR - ACTIVE_START_HOUR - futureCount;
      const effectiveMaxScore = Math.max(0, completedHours + snackBlocks.length * 2 + 4);
      const score = Math.max(
        0,
        Math.min(
          24,
          stoodCount + snackBlocksMet * 2 + realWorkoutBonus - Math.max(0, longestMissedStandRun - 1),
        ),
      );
      const snackGaps = snackBlocks
        .filter(([startHour, endHour]) => {
          const start = localDateTimeToUtc(dateKey, startHour);
          const end = localDateTimeToUtc(dateKey, endHour);
          return !snackWorkouts.some((workout) => workout.start >= start && workout.start < end);
        })
        .map(([startHour, endHour]) => ({
          start: localDateTimeToUtc(dateKey, startHour).toISOString(),
          end: localDateTimeToUtc(dateKey, endHour).toISOString(),
          hours: endHour - startHour,
        }));

      return {
        date: dateKey,
        score,
        maxScore: dateKey === dayKeys[0] ? Math.min(24, effectiveMaxScore) : 24,
        standHours: stoodCount,
        snackCoveredHours: snackCoveredCount,
        snackBlocksMet,
        realWorkoutBonus,
        missedStandHours: hours
          .filter((hour) => !hour.stood && hour.state !== 'future')
          .map((hour) => hour.hour),
        longestMissedStandRun,
        snackGaps,
        hours,
      };
    });

    const today = days[0];
    const rollingScore = Math.round(
      days.reduce((sum, day) => sum + day.score, 0) / Math.max(1, days.length),
    );
    const latestSnack = snackWorkouts
      .filter((workout) => workout.start <= now)
      .sort((a, b) => b.start.getTime() - a.start.getTime())[0];
    const nextSnackDue =
      latestSnack == null
        ? localDateTimeToUtc(dayKeys[0], ACTIVE_START_HOUR + SNACK_CADENCE_HOURS)
        : new Date(latestSnack.start.getTime() + SNACK_CADENCE_HOURS * 60 * 60 * 1000);
    const todaySnackOverdue =
      now >= localDateTimeToUtc(dayKeys[0], ACTIVE_START_HOUR) &&
      now <= localDateTimeToUtc(dayKeys[0], ACTIVE_END_HOUR) &&
      nextSnackDue.getTime() < now.getTime();
    const status: MoveScoreStatus =
      today.score >= 19 && !todaySnackOverdue
        ? 'strong'
        : today.score >= 13 && today.longestMissedStandRun < 3
          ? 'watch'
          : 'stale';

    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({
      generatedAt: now.toISOString(),
      timezone: TIME_ZONE,
      window: {
        start: localDateTimeToUtc(oldestDay, ACTIVE_START_HOUR).toISOString(),
        end: localDateTimeToUtc(newestDay, ACTIVE_END_HOUR).toISOString(),
        days: ROLLING_DAYS,
      },
      activeHours: {
        startHour: ACTIVE_START_HOUR,
        endHour: ACTIVE_END_HOUR,
        snackCadenceHours: SNACK_CADENCE_HOURS,
      },
      score: {
        today: today.score,
        rolling: rollingScore,
        max: 24,
        status,
      },
      snackCadence: {
        latestSnackWorkout:
          latestSnack == null
            ? null
            : {
                id: latestSnack.id,
                name: latestSnack.name,
                start: latestSnack.start.toISOString(),
                durationSeconds: latestSnack.durationSeconds,
              },
        nextSnackDue: nextSnackDue.toISOString(),
        overdue: todaySnackOverdue,
      },
      days,
    });
  } catch (error) {
    console.error('weekly move error:', error);
    res.status(500).json({ error: 'Failed to load movement score' });
  }
});

export default router;
