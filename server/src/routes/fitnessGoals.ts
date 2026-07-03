import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { WorkoutModel } from '../models/Workout';
import { getWorkoutScale, REAL_WORKOUT_MIN_DURATION_SECONDS } from '../utils/workoutClassification';

const router = Router();

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLING_DAYS = 7;
const LIFTING_TARGET_SESSIONS = 2;
const LIFTING_STRETCH_TARGET_SESSIONS = 3;
const LIFTING_MIN_DURATION_SECONDS = 20 * 60;
const FLEXIBILITY_TARGET_SESSIONS = 5;
const FLEXIBILITY_MIN_DURATION_SECONDS = 20 * 60;
const CARDIO_TARGET_SECONDS = 90 * 60;
const MAX_HEART_RATE_GAP_SECONDS = 30;

interface HeartRateSample {
  Avg: number;
  date: Date;
}

function isLifting(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.includes('strength training') ||
    normalized.includes('weight training') ||
    normalized.includes('weightlifting')
  );
}

function isFlexibility(name: string): boolean {
  return name.toLowerCase().includes('flexibility');
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

async function getElevatedHeartRateThreshold(now: Date) {
  const db = mongoose.connection.db;
  if (!db) {
    return { thresholdBpm: 100, restingMedianBpm: null, calibrationDays: 0 };
  }

  const calibrationStart = new Date(now.getTime() - 30 * DAY_MS);
  const records = await db
    .collection('resting_heart_rate')
    .find({ date: { $gte: calibrationStart, $lte: now } })
    .project({ qty: 1, Avg: 1 })
    .toArray();
  const restingValues = records
    .map((record) =>
      typeof record.qty === 'number'
        ? record.qty
        : typeof record.Avg === 'number'
          ? record.Avg
          : null,
    )
    .filter((value): value is number => value != null && value > 0);
  const restingMedianBpm = median(restingValues);

  return {
    thresholdBpm: restingMedianBpm == null ? 100 : Math.max(90, Math.round(restingMedianBpm + 30)),
    restingMedianBpm,
    calibrationDays: restingValues.length,
  };
}

function measuredHeartRateSeconds(
  samples: HeartRateSample[] | undefined,
  thresholdBpm: number,
): { elevatedSeconds: number; trackedSeconds: number } {
  if (!samples || samples.length < 2) {
    return { elevatedSeconds: 0, trackedSeconds: 0 };
  }

  const sorted = [...samples].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let elevatedSeconds = 0;
  let trackedSeconds = 0;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const seconds =
      (new Date(sorted[index + 1].date).getTime() - new Date(sorted[index].date).getTime()) / 1000;
    if (seconds <= 0 || seconds > MAX_HEART_RATE_GAP_SECONDS) continue;
    trackedSeconds += seconds;
    if (sorted[index].Avg >= thresholdBpm) elevatedSeconds += seconds;
  }

  return { elevatedSeconds, trackedSeconds };
}

router.get('/goals/weekly', async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - ROLLING_DAYS * DAY_MS);
    const [workouts, latestRealWorkout, threshold] = await Promise.all([
      WorkoutModel.find({
        start: { $gte: windowStart, $lte: now },
      })
        .sort({ start: -1 })
        .lean(),
      WorkoutModel.findOne({
        start: { $lte: now },
        duration: { $gt: REAL_WORKOUT_MIN_DURATION_SECONDS },
      })
        .sort({ start: -1 })
        .lean(),
      getElevatedHeartRateThreshold(now),
    ]);

    let cardioWorkoutSeconds = 0;
    let elevatedHeartRateSeconds = 0;
    let heartRateTrackedSeconds = 0;

    const workoutRows = workouts.map((workout) => {
      const lifting = isLifting(workout.name);
      const flexibility = isFlexibility(workout.name);
      const cardio = !lifting && !flexibility;
      const heartRate = measuredHeartRateSeconds(workout.heartRateData, threshold.thresholdBpm);
      const workoutScale = getWorkoutScale(workout.duration);

      if (cardio) cardioWorkoutSeconds += workout.duration;
      elevatedHeartRateSeconds += heartRate.elevatedSeconds;
      heartRateTrackedSeconds += heartRate.trackedSeconds;

      return {
        id: workout.workoutId,
        name: workout.name,
        start: new Date(workout.start).toISOString(),
        durationSeconds: workout.duration,
        workoutScale,
        category: lifting ? 'lifting' : flexibility ? 'flexibility' : 'cardio',
        qualifiesForLifting: lifting && workout.duration >= LIFTING_MIN_DURATION_SECONDS,
        qualifiesForFlexibility: flexibility && workout.duration > FLEXIBILITY_MIN_DURATION_SECONDS,
        elevatedHeartRateSeconds: heartRate.elevatedSeconds,
        heartRateTrackedSeconds: heartRate.trackedSeconds,
      };
    });

    const qualifyingLiftingSessions = workoutRows.filter(
      (workout) => workout.qualifiesForLifting,
    ).length;
    const qualifyingFlexibilitySessions = workoutRows.filter(
      (workout) => workout.qualifiesForFlexibility,
    ).length;
    const hoursSinceRealWorkout =
      latestRealWorkout == null
        ? null
        : (now.getTime() - new Date(latestRealWorkout.start).getTime()) / (60 * 60 * 1000);
    const daysSinceRealWorkout =
      hoursSinceRealWorkout == null ? null : Math.floor(hoursSinceRealWorkout / 24);
    const realWorkoutCadenceStatus =
      daysSinceRealWorkout == null
        ? 'critical'
        : daysSinceRealWorkout <= 1
          ? 'ok'
          : daysSinceRealWorkout <= 2
            ? 'warning'
            : 'critical';

    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({
      generatedAt: now.toISOString(),
      window: {
        start: windowStart.toISOString(),
        end: now.toISOString(),
        days: ROLLING_DAYS,
      },
      lifting: {
        qualifyingSessions: qualifyingLiftingSessions,
        targetSessions: LIFTING_TARGET_SESSIONS,
        stretchTargetSessions: LIFTING_STRETCH_TARGET_SESSIONS,
        minimumSessionSeconds: LIFTING_MIN_DURATION_SECONDS,
        met: qualifyingLiftingSessions >= LIFTING_TARGET_SESSIONS,
        stretchMet: qualifyingLiftingSessions >= LIFTING_STRETCH_TARGET_SESSIONS,
      },
      flexibility: {
        qualifyingSessions: qualifyingFlexibilitySessions,
        targetSessions: FLEXIBILITY_TARGET_SESSIONS,
        minimumSessionSeconds: FLEXIBILITY_MIN_DURATION_SECONDS,
        met: qualifyingFlexibilitySessions >= FLEXIBILITY_TARGET_SESSIONS,
      },
      cardio: {
        workoutSeconds: cardioWorkoutSeconds,
        elevatedHeartRateSeconds,
        heartRateTrackedSeconds,
        targetSeconds: CARDIO_TARGET_SECONDS,
        workoutTimeMet: cardioWorkoutSeconds >= CARDIO_TARGET_SECONDS,
        elevatedHeartRateMet: elevatedHeartRateSeconds >= CARDIO_TARGET_SECONDS,
      },
      elevatedHeartRate: {
        ...threshold,
        method: '30-day resting median + 30 BPM, with a 90 BPM minimum',
        maximumSampleGapSeconds: MAX_HEART_RATE_GAP_SECONDS,
      },
      realWorkoutCadence: {
        status: realWorkoutCadenceStatus,
        daysSinceRealWorkout,
        hoursSinceRealWorkout:
          hoursSinceRealWorkout == null ? null : Math.round(hoursSinceRealWorkout * 10) / 10,
        minimumDurationSeconds: REAL_WORKOUT_MIN_DURATION_SECONDS,
        latestRealWorkout:
          latestRealWorkout == null
            ? null
            : {
                id: latestRealWorkout.workoutId,
                name: latestRealWorkout.name,
                start: new Date(latestRealWorkout.start).toISOString(),
                durationSeconds: latestRealWorkout.duration,
              },
      },
      workouts: workoutRows,
    });
  } catch (error) {
    console.error('weekly fitness goals error:', error);
    res.status(500).json({ error: 'Failed to load weekly fitness goals' });
  }
});

export default router;
