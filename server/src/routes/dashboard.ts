import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { SleepModel } from '../models/Metric';
import { RouteModel, WorkoutModel } from '../models/Workout';
import { getWorkoutScale, type WorkoutScale } from '../utils/workoutClassification';

const router = Router();

const EXCLUDED_COLLECTIONS = new Set(['workouts', 'workout_routes']);

const CUMULATIVE_METRICS = new Set([
  'active_energy',
  'basal_energy_burned',
  'apple_exercise_time',
  'step_count',
  'walking_running_distance',
  'cycling_distance',
  'swimming_distance',
  'wheelchair_distance',
  'flights_climbed',
  'apple_move_time',
  'apple_stand_time',
  'wheelchair_push_count',
  'swim_stroke_count',
  'downhill_snow_sports',
]);

const HEART_RATE_METRICS = new Set([
  'heart_rate',
  'resting_heart_rate',
  'walking_heart_rate',
  'cardio_recovery',
]);

type MetricKind = 'scalar' | 'heart_rate' | 'blood_pressure' | 'sleep';

interface MetricMeta {
  metric_name: string;
  category: string;
  display_label: string;
  display_unit: string;
  is_cumulative: boolean;
  display_multiplier: number;
  visible: boolean;
}

function formatLabel(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseDateParam(value: string | undefined, fallback: Date, endOfDay = false): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  if (endOfDay) {
    parsed.setUTCHours(23, 59, 59, 999);
  }
  return parsed;
}

function parseRange(req: Request): { start: Date; end: Date } {
  const end = parseDateParam(req.query.end as string | undefined, new Date(), true);
  const defaultStart = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  defaultStart.setUTCHours(0, 0, 0, 0);
  const start = parseDateParam(req.query.start as string | undefined, defaultStart);
  return { start, end };
}

function bucketUnit(agg: string): 'hour' | 'day' | 'week' | 'month' {
  switch (agg) {
    case 'hourly':
      return 'hour';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
    default:
      return 'day';
  }
}

function metricKind(name: string): MetricKind {
  if (name === 'sleep_analysis') return 'sleep';
  if (name === 'blood_pressure') return 'blood_pressure';
  if (HEART_RATE_METRICS.has(name)) return 'heart_rate';
  return 'scalar';
}

async function listMetricCollections(): Promise<string[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const collections = await db.listCollections().toArray();
  const names: string[] = [];

  for (const collection of collections) {
    const name = collection.name;
    if (name.startsWith('system.') || EXCLUDED_COLLECTIONS.has(name)) continue;
    const count = await db.collection(name).estimatedDocumentCount();
    if (count > 0) names.push(name);
  }

  return names.sort();
}

function buildMetricMeta(name: string, sample: Record<string, unknown> | null): MetricMeta {
  const units = typeof sample?.units === 'string' ? sample.units : '';
  return {
    metric_name: name,
    category: 'health',
    display_label: formatLabel(name),
    display_unit: units,
    is_cumulative: CUMULATIVE_METRICS.has(name),
    display_multiplier: 1,
    visible: true,
  };
}

async function getLatestRow(name: string): Promise<Record<string, unknown> | null> {
  const db = mongoose.connection.db;
  if (!db) return null;

  return db.collection(name).find({}).sort({ date: -1 }).limit(1).next();
}

function toHealthMetricRow(name: string, doc: Record<string, unknown>): Record<string, unknown> {
  const time = new Date(doc.date as string | Date).toISOString();
  const units = String(doc.units ?? '');

  if (metricKind(name) === 'heart_rate') {
    return {
      Time: time,
      MetricName: name,
      Units: units,
      Qty: doc.Avg ?? null,
      MinVal: doc.Min ?? null,
      AvgVal: doc.Avg ?? null,
      MaxVal: doc.Max ?? null,
    };
  }

  if (metricKind(name) === 'blood_pressure') {
    return {
      Time: time,
      MetricName: name,
      Units: units,
      Qty: doc.systolic ?? null,
      MinVal: doc.diastolic ?? null,
      AvgVal: doc.systolic ?? null,
      MaxVal: doc.diastolic ?? null,
    };
  }

  return {
    Time: time,
    MetricName: name,
    Units: units,
    Qty: doc.qty ?? null,
    MinVal: doc.qty ?? null,
    AvgVal: doc.qty ?? null,
    MaxVal: doc.qty ?? null,
  };
}

async function getDailySums(): Promise<Record<string, unknown>[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const sums: Record<string, unknown>[] = [];

  for (const name of CUMULATIVE_METRICS) {
    const collection = db.collection(name);
    const exists = (await collection.estimatedDocumentCount()) > 0;
    if (!exists) continue;

    const result = await collection
      .aggregate([
        { $match: { date: { $gte: startOfDay } } },
        {
          $group: {
            _id: null,
            total: { $sum: '$qty' },
            units: { $first: '$units' },
          },
        },
      ])
      .toArray();

    if (result.length === 0) continue;

    sums.push({
      MetricName: name,
      Units: result[0].units ?? '',
      Total: result[0].total ?? 0,
    });
  }

  return sums;
}

async function aggregateTimeSeries(
  name: string,
  start: Date,
  end: Date,
  unit: 'hour' | 'day' | 'week' | 'month',
): Promise<Record<string, unknown>[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const kind = metricKind(name);
  const avgField =
    kind === 'heart_rate' ? '$Avg' : kind === 'blood_pressure' ? '$systolic' : '$qty';
  const minField =
    kind === 'heart_rate' ? '$Min' : kind === 'blood_pressure' ? '$diastolic' : '$qty';
  const maxField =
    kind === 'heart_rate' ? '$Max' : kind === 'blood_pressure' ? '$systolic' : '$qty';

  const rows = await db
    .collection(name)
    .aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { $dateTrunc: { date: '$date', unit } },
          avg: { $avg: avgField },
          min: { $min: minField },
          max: { $max: maxField },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows.map((row) => ({
    time: new Date(row._id).toISOString(),
    avg: row.avg ?? null,
    min: row.min ?? null,
    max: row.max ?? null,
    count: row.count ?? 0,
  }));
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

async function getScalarValues(name: string, start: Date, end: Date): Promise<number[]> {
  const db = mongoose.connection.db;
  if (!db) return [];

  const kind = metricKind(name);
  const docs = await db
    .collection(name)
    .find({ date: { $gte: start, $lte: end } })
    .project({ qty: 1, Avg: 1, systolic: 1 })
    .toArray();

  return docs
    .map((doc) => {
      if (kind === 'heart_rate') return doc.Avg as number | undefined;
      if (kind === 'blood_pressure') return doc.systolic as number | undefined;
      return doc.qty as number | undefined;
    })
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
}

router.get('/version', (_req: Request, res: Response) => {
  res.json({ version: 'health-auto-dashboard' });
});

router.get('/dashboard/init', async (_req: Request, res: Response) => {
  try {
    const names = await listMetricCollections();
    const available = await Promise.all(
      names.map(async (name) => buildMetricMeta(name, await getLatestRow(name))),
    );

    const latest = (
      await Promise.all(
        names.map(async (name) => {
          const doc = await getLatestRow(name);
          return doc ? toHealthMetricRow(name, doc) : null;
        }),
      )
    ).filter(Boolean);

    const daily_sums = await getDailySums();

    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ available_metrics: available, latest, daily_sums });
  } catch (error) {
    console.error('dashboard init error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

router.get('/metrics/latest', async (_req: Request, res: Response) => {
  try {
    const names = await listMetricCollections();
    const latest = (
      await Promise.all(
        names.map(async (name) => {
          const doc = await getLatestRow(name);
          return doc ? toHealthMetricRow(name, doc) : null;
        }),
      )
    ).filter(Boolean);
    const daily_sums = await getDailySums();
    res.json({ latest, daily_sums });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load latest metrics' });
  }
});

router.get('/metrics/available', async (_req: Request, res: Response) => {
  try {
    const names = await listMetricCollections();
    const available = await Promise.all(
      names.map(async (name) => buildMetricMeta(name, await getLatestRow(name))),
    );
    res.json(available);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load available metrics' });
  }
});

router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const metric = String(req.query.metric || '');
    if (!metric) {
      res.status(400).json({ error: 'metric parameter required' });
      return;
    }

    const { start, end } = parseRange(req);
    const unit = bucketUnit(String(req.query.agg || 'daily'));
    const points = await aggregateTimeSeries(metric, start, end, unit);
    res.json(points);
  } catch (error) {
    console.error('timeseries error:', error);
    res.status(500).json({ error: 'Failed to load time series' });
  }
});

router.get('/metrics/stats', async (req: Request, res: Response) => {
  try {
    const metric = String(req.query.metric || '');
    if (!metric) {
      res.status(400).json({ error: 'metric parameter required' });
      return;
    }

    const { start, end } = parseRange(req);
    const values = await getScalarValues(metric, start, end);

    if (values.length === 0) {
      res.json({ metric, avg: null, min: null, max: null, stddev: null, count: 0 });
      return;
    }

    res.json({
      metric,
      avg: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      stddev: stddev(values),
      count: values.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load metric stats' });
  }
});

router.get('/sleep', async (req: Request, res: Response) => {
  try {
    const { start, end } = parseRange(req);
    const records = await SleepModel.find({
      date: { $gte: start, $lte: end },
    })
      .sort({ date: -1 })
      .lean();

    type NightBucket = {
      Date: Date;
      Core: number;
      Deep: number;
      REM: number;
      Awake: number;
      InBed: number;
      SleepStart: Date | null;
      SleepEnd: Date | null;
      InBedStart: Date | null;
      InBedEnd: Date | null;
    };

    const nights = new Map<string, NightBucket>();

    for (const record of records) {
      const nightDate = new Date(record.date);
      nightDate.setUTCHours(0, 0, 0, 0);
      const key = nightDate.toISOString();

      const bucket =
        nights.get(key) ??
        ({
          Date: nightDate,
          Core: 0,
          Deep: 0,
          REM: 0,
          Awake: 0,
          InBed: 0,
          SleepStart: null,
          SleepEnd: null,
          InBedStart: null,
          InBedEnd: null,
        } satisfies NightBucket);

      bucket.Core += record.core ?? 0;
      bucket.Deep += record.deep ?? 0;
      bucket.REM += record.rem ?? 0;
      bucket.Awake += record.awake ?? 0;
      bucket.InBed += record.inBed ?? 0;

      const candidates = [
        record.sleepStart,
        record.inBedStart,
        record.date,
        record.endDate,
        record.sleepEnd,
        record.inBedEnd,
      ].filter(Boolean) as Date[];

      for (const candidate of candidates) {
        const when = new Date(candidate);
        if (!bucket.SleepStart || when < bucket.SleepStart) bucket.SleepStart = when;
        if (!bucket.SleepEnd || when > bucket.SleepEnd) bucket.SleepEnd = when;
        if (record.inBedStart && (!bucket.InBedStart || when < bucket.InBedStart)) {
          bucket.InBedStart = new Date(record.inBedStart);
        }
        if (record.inBedEnd && (!bucket.InBedEnd || when > bucket.InBedEnd)) {
          bucket.InBedEnd = new Date(record.inBedEnd);
        }
      }

      nights.set(key, bucket);
    }

    const mappedSessions = [...nights.values()]
      .map((session, index) => {
        const asleep = session.Core + session.REM + session.Deep;
        const totalSleep = asleep > 0 ? asleep : session.InBed;
        return {
          ID: index + 1,
          UserID: 0,
          Date: session.Date.toISOString(),
          TotalSleep: totalSleep,
          Asleep: asleep,
          Core: session.Core,
          Deep: session.Deep,
          REM: session.REM,
          Awake: session.Awake,
          InBed: session.InBed,
          SleepStart: session.SleepStart ? session.SleepStart.toISOString() : '',
          SleepEnd: session.SleepEnd ? session.SleepEnd.toISOString() : '',
          InBedStart: session.InBedStart ? session.InBedStart.toISOString() : '',
          InBedEnd: session.InBedEnd ? session.InBedEnd.toISOString() : '',
        };
      })
      .filter((session) => session.TotalSleep > 0 || session.InBed > 0)
      .sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime());

    const stageTimeline = records
      .filter((record) => record.stage && (record.qty ?? 0) > 0)
      .map((record) => {
        const startTime = new Date(record.date);
        const endTime = record.endDate
          ? new Date(record.endDate)
          : new Date(startTime.getTime() + (record.qty ?? 0) * 3600000);
        const stageName = String(record.stage);
        const normalized =
          stageName.toLowerCase() === 'rem'
            ? 'REM'
            : stageName.charAt(0).toUpperCase() + stageName.slice(1).toLowerCase();

        return {
          StartTime: startTime.toISOString(),
          EndTime: endTime.toISOString(),
          Stage: normalized,
          DurationHr: record.qty ?? 0,
          Source: record.source,
        };
      })
      .sort((a, b) => new Date(a.StartTime).getTime() - new Date(b.StartTime).getTime());

    res.json({ sessions: mappedSessions, stages: stageTimeline });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sleep data' });
  }
});

type WorkoutHeatLabel = 'Chill' | 'Warm' | 'Hot' | 'On fire';

function getWorkoutBadges(
  durationSec: number,
  heartRateData?: Array<{ Avg: number; date: Date }>,
): {
  workoutScale: WorkoutScale;
  heatScore: number | null;
  heatLabel: WorkoutHeatLabel | null;
} {
  const workoutScale = getWorkoutScale(durationSec);
  if (!heartRateData || heartRateData.length === 0) {
    return { workoutScale, heatScore: null, heatLabel: null };
  }

  const samples = [...heartRateData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const average = samples.reduce((sum, sample) => sum + sample.Avg, 0) / samples.length;
  let trackedSeconds = 0;
  let above100Seconds = 0;
  let above120Seconds = 0;
  let above140Seconds = 0;

  for (let index = 0; index < samples.length - 1; index += 1) {
    const seconds =
      (new Date(samples[index + 1].date).getTime() - new Date(samples[index].date).getTime()) /
      1000;
    if (seconds <= 0 || seconds > 600) continue;
    trackedSeconds += seconds;
    if (samples[index].Avg >= 100) above100Seconds += seconds;
    if (samples[index].Avg >= 120) above120Seconds += seconds;
    if (samples[index].Avg >= 140) above140Seconds += seconds;
  }

  const sampleRatio = (threshold: number) =>
    samples.filter((sample) => sample.Avg >= threshold).length / samples.length;
  const ratio100 = trackedSeconds > 0 ? above100Seconds / trackedSeconds : sampleRatio(100);
  const ratio120 = trackedSeconds > 0 ? above120Seconds / trackedSeconds : sampleRatio(120);
  const ratio140 = trackedSeconds > 0 ? above140Seconds / trackedSeconds : sampleRatio(140);

  let heatScore = 0;
  if (average >= 130 || ratio140 >= 0.2 || ratio120 >= 0.65) {
    heatScore = 3;
  } else if (average >= 110 || ratio120 >= 0.25 || ratio100 >= 0.75) {
    heatScore = 2;
  } else if (average >= 95 || ratio100 >= 0.25) {
    heatScore = 1;
  }

  const labels: WorkoutHeatLabel[] = ['Chill', 'Warm', 'Hot', 'On fire'];
  return { workoutScale, heatScore, heatLabel: labels[heatScore] };
}

router.get('/workouts', async (req: Request, res: Response) => {
  try {
    const { start, end } = parseRange(req);
    const type = req.query.type as string | undefined;

    const query: Record<string, unknown> = {
      start: { $gte: start, $lte: end },
    };
    if (type) query.name = type;

    const workouts = await WorkoutModel.find(query).sort({ start: -1 }).lean();

    res.json(
      workouts.map((workout) => {
        const badges = getWorkoutBadges(workout.duration, workout.heartRateData);
        const avgHeartRate =
          workout.heartRateData && workout.heartRateData.length > 0
            ? workout.heartRateData.reduce((sum, hr) => sum + hr.Avg, 0) /
              workout.heartRateData.length
            : null;
        const maxHeartRate =
          workout.heartRateData && workout.heartRateData.length > 0
            ? Math.max(...workout.heartRateData.map((hr) => hr.Max))
            : null;
        const minHeartRate =
          workout.heartRateData && workout.heartRateData.length > 0
            ? Math.min(...workout.heartRateData.map((hr) => hr.Min))
            : null;

        return {
          ID: workout.workoutId,
          UserID: 0,
          Name: workout.name,
          Source: workout.heartRateData?.[0]?.source ?? workout.activeEnergyBurned?.source,
          StartTime: new Date(workout.start).toISOString(),
          EndTime: new Date(workout.end).toISOString(),
          DurationSec: workout.duration,
          Location: workout.location ?? (workout.distance ? 'Outdoor' : 'Unknown'),
          IsIndoor: workout.isIndoor ?? !workout.distance,
          ActiveEnergyBurned: workout.activeEnergyBurned?.qty ?? null,
          ActiveEnergyUnits: workout.activeEnergyBurned?.units ?? 'kcal',
          TotalEnergy: workout.totalEnergy?.qty ?? null,
          TotalEnergyUnits: workout.totalEnergy?.units ?? 'kcal',
          Distance: workout.distance?.qty ?? null,
          DistanceUnits: workout.distance?.units ?? 'mi',
          AvgHeartRate: avgHeartRate,
          MaxHeartRate: maxHeartRate,
          MinHeartRate: minHeartRate,
          ElevationUp: workout.elevationUp?.qty ?? null,
          ElevationDown: workout.elevationDown?.qty ?? null,
          WorkoutScale: badges.workoutScale,
          HeatScore: badges.heatScore,
          HeatLabel: badges.heatLabel,
        };
      }),
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to load workouts' });
  }
});

type PerformanceMetric =
  | 'durationSec'
  | 'avgHeartRate'
  | 'effortSeconds'
  | 'effortCount'
  | 'recoverySeconds'
  | 'recoveryCount'
  | 'effortRecoveryRatio';

interface PerformanceSummary {
  durationSec: number;
  avgHeartRate: number | null;
  effortSeconds: number | null;
  effortCount: number | null;
  recoverySeconds: number | null;
  recoveryCount: number | null;
  effortRecoveryRatio: number | null;
}

interface HeartRateSample {
  Avg: number;
  date: Date;
}

const PERFORMANCE_METRICS: PerformanceMetric[] = [
  'durationSec',
  'avgHeartRate',
  'effortSeconds',
  'effortCount',
  'recoverySeconds',
  'recoveryCount',
  'effortRecoveryRatio',
];

function summarizeWorkoutPerformance(
  durationSec: number,
  heartRateData?: HeartRateSample[],
): PerformanceSummary {
  if (!heartRateData || heartRateData.length < 2) {
    return {
      durationSec,
      avgHeartRate: null,
      effortSeconds: null,
      effortCount: null,
      recoverySeconds: null,
      recoveryCount: null,
      effortRecoveryRatio: null,
    };
  }

  const samples = [...heartRateData].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const avgHeartRate = samples.reduce((sum, sample) => sum + sample.Avg, 0) / samples.length;
  let effortSeconds = 0;
  let recoverySeconds = 0;
  let effortRun = 0;
  let recoveryRun = 0;
  let effortCount = 0;
  let recoveryCount = 0;

  const closeRuns = () => {
    if (effortRun >= 30) effortCount += 1;
    if (recoveryRun >= 240) recoveryCount += 1;
    effortRun = 0;
    recoveryRun = 0;
  };

  for (let index = 0; index < samples.length - 1; index += 1) {
    const current = samples[index];
    const next = samples[index + 1];
    const seconds = (new Date(next.date).getTime() - new Date(current.date).getTime()) / 1000;

    // A large gap is not evidence that the heart rate stayed in the same state.
    if (seconds <= 0 || seconds > 600) {
      closeRuns();
      continue;
    }

    if (current.Avg >= 100) {
      if (recoveryRun > 0) {
        if (recoveryRun >= 240) recoveryCount += 1;
        recoveryRun = 0;
      }
      effortSeconds += seconds;
      effortRun += seconds;
    } else {
      if (effortRun > 0) {
        if (effortRun >= 30) effortCount += 1;
        effortRun = 0;
      }
      recoverySeconds += seconds;
      recoveryRun += seconds;
    }
  }
  closeRuns();

  return {
    durationSec,
    avgHeartRate,
    effortSeconds,
    effortCount,
    recoverySeconds,
    recoveryCount,
    effortRecoveryRatio: effortCount / Math.max(1, recoveryCount),
  };
}

function benchmarkMetric(
  metric: PerformanceMetric,
  weekly: PerformanceSummary[],
  monthly: PerformanceSummary[],
) {
  const lowerIsBetter = metric === 'recoverySeconds' || metric === 'recoveryCount';
  const weeklyValues = weekly
    .map((summary) => summary[metric])
    .filter((value): value is number => value != null);
  const monthlyValues = monthly
    .map((summary) => summary[metric])
    .filter((value): value is number => value != null);

  return {
    weeklyBest:
      weeklyValues.length > 0
        ? lowerIsBetter
          ? Math.min(...weeklyValues)
          : Math.max(...weeklyValues)
        : null,
    monthlyBest:
      monthlyValues.length > 0
        ? lowerIsBetter
          ? Math.min(...monthlyValues)
          : Math.max(...monthlyValues)
        : null,
    monthlyAverage:
      monthlyValues.length > 0
        ? monthlyValues.reduce((sum, value) => sum + value, 0) / monthlyValues.length
        : null,
  };
}

router.get('/workouts/:id/performance', async (req: Request, res: Response) => {
  try {
    const workout = await WorkoutModel.findOne({ workoutId: req.params.id }).lean();
    if (!workout) {
      res.status(404).json({ error: 'workout not found' });
      return;
    }

    const workoutStart = new Date(workout.start);
    const monthStart = new Date(workoutStart.getTime() - 30 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(workoutStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const priorWorkouts = await WorkoutModel.find({
      name: workout.name,
      start: { $gte: monthStart, $lt: workoutStart },
    })
      .sort({ start: -1 })
      .lean();

    const monthly = priorWorkouts.map((prior) =>
      summarizeWorkoutPerformance(prior.duration, prior.heartRateData),
    );
    const weekly = priorWorkouts
      .filter((prior) => new Date(prior.start) >= weekStart)
      .map((prior) => summarizeWorkoutPerformance(prior.duration, prior.heartRateData));
    const benchmarks = Object.fromEntries(
      PERFORMANCE_METRICS.map((metric) => [metric, benchmarkMetric(metric, weekly, monthly)]),
    );

    res.json({
      current: summarizeWorkoutPerformance(workout.duration, workout.heartRateData),
      benchmarks,
      comparisonWorkoutCount: monthly.length,
      weeklyWorkoutCount: weekly.length,
      workoutType: workout.name,
    });
  } catch (error) {
    console.error('workout performance error:', error);
    res.status(500).json({ error: 'Failed to load workout performance' });
  }
});

router.get('/workouts/:id', async (req: Request, res: Response) => {
  try {
    const workout = await WorkoutModel.findOne({ workoutId: req.params.id }).lean();
    if (!workout) {
      res.status(404).json({ error: 'workout not found' });
      return;
    }

    const route = await RouteModel.findOne({ workoutId: req.params.id }).lean();
    const badges = getWorkoutBadges(workout.duration, workout.heartRateData);
    const avgHeartRate =
      workout.heartRateData && workout.heartRateData.length > 0
        ? workout.heartRateData.reduce((sum, hr) => sum + hr.Avg, 0) / workout.heartRateData.length
        : null;

    res.json({
      ID: workout.workoutId,
      UserID: 0,
      Name: workout.name,
      Source: workout.heartRateData?.[0]?.source,
      StartTime: new Date(workout.start).toISOString(),
      EndTime: new Date(workout.end).toISOString(),
      DurationSec: workout.duration,
      Location: workout.location ?? (route ? 'Outdoor' : 'Unknown'),
      IsIndoor: workout.isIndoor ?? !route,
      ActiveEnergyBurned: workout.activeEnergyBurned?.qty ?? null,
      ActiveEnergyUnits: workout.activeEnergyBurned?.units ?? 'kcal',
      TotalEnergy: workout.totalEnergy?.qty ?? null,
      TotalEnergyUnits: workout.totalEnergy?.units ?? 'kcal',
      Distance: workout.distance?.qty ?? null,
      DistanceUnits: workout.distance?.units ?? 'mi',
      AvgHeartRate: avgHeartRate,
      MaxHeartRate:
        workout.heartRateData && workout.heartRateData.length > 0
          ? Math.max(...workout.heartRateData.map((hr) => hr.Max))
          : null,
      MinHeartRate:
        workout.heartRateData && workout.heartRateData.length > 0
          ? Math.min(...workout.heartRateData.map((hr) => hr.Min))
          : null,
      ElevationUp: workout.elevationUp?.qty ?? null,
      ElevationDown: workout.elevationDown?.qty ?? null,
      WorkoutScale: badges.workoutScale,
      HeatScore: badges.heatScore,
      HeatLabel: badges.heatLabel,
      HeartRateData:
        workout.heartRateData?.map((hr) => ({
          Time: new Date(hr.date).toISOString(),
          MinBPM: hr.Min,
          AvgBPM: hr.Avg,
          MaxBPM: hr.Max,
        })) ?? null,
      RouteData:
        route?.locations.map((location) => ({
          Time: new Date(location.timestamp).toISOString(),
          Latitude: location.latitude,
          Longitude: location.longitude,
          Altitude: location.altitude ?? null,
          Speed: location.speed ?? null,
        })) ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load workout detail' });
  }
});

router.get('/workouts/:id/sets', (_req: Request, res: Response) => {
  res.json([]);
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const names = await listMetricCollections();
    const db = mongoose.connection.db;
    let totalMetricRows = 0;

    if (db) {
      for (const name of names) {
        totalMetricRows += await db.collection(name).estimatedDocumentCount();
      }
    }

    const [workoutCount, sleepCount] = await Promise.all([
      WorkoutModel.estimatedDocumentCount(),
      SleepModel.estimatedDocumentCount(),
    ]);

    res.json({
      total_metric_rows: totalMetricRows,
      total_workouts: workoutCount,
      total_sleep_nights: sleepCount,
      total_sets: 0,
      earliest_data: null,
      latest_data: null,
      workouts_by_type: null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

export default router;
