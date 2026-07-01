import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';

import { RouteModel, WorkoutModel } from '../models/Workout';
import { SleepModel } from '../models/Metric';

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

function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseRange(req: Request): { start: Date; end: Date } {
  const end = parseDateParam(req.query.end as string | undefined, new Date());
  const defaultStart = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
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
  const avgField = kind === 'heart_rate' ? '$Avg' : kind === 'blood_pressure' ? '$systolic' : '$qty';
  const minField = kind === 'heart_rate' ? '$Min' : kind === 'blood_pressure' ? '$diastolic' : '$qty';
  const maxField = kind === 'heart_rate' ? '$Max' : kind === 'blood_pressure' ? '$systolic' : '$qty';

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

async function getScalarValues(
  name: string,
  start: Date,
  end: Date,
): Promise<number[]> {
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

function pearsonR(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;

  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? null : numerator / denominator;
}

router.get('/version', (_req: Request, res: Response) => {
  res.json({ version: 'health-auto-dashboard' });
});

router.get('/me', (_req: Request, res: Response) => {
  res.json({
    login: process.env.DASHBOARD_USERNAME || 'admin',
    display_name: 'Health Auto Export',
  });
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

router.get('/correlation', async (req: Request, res: Response) => {
  try {
    const xMetric = String(req.query.x || '');
    const yMetric = String(req.query.y || '');
    if (!xMetric || !yMetric) {
      res.status(400).json({ error: 'x and y metric parameters required' });
      return;
    }

    const { start, end } = parseRange(req);
    const unit = bucketUnit(String(req.query.bucket || '1 day').replace('1 ', ''));

    const [xSeries, ySeries] = await Promise.all([
      aggregateTimeSeries(xMetric, start, end, unit === 'hour' ? 'hour' : 'day'),
      aggregateTimeSeries(yMetric, start, end, unit === 'hour' ? 'hour' : 'day'),
    ]);

    const yByTime = new Map(ySeries.map((point) => [point.time as string, point.avg as number | null]));
    const points: Record<string, unknown>[] = [];
    const xs: number[] = [];
    const ys: number[] = [];

    for (const point of xSeries) {
      const y = yByTime.get(point.time as string) ?? null;
      const x = point.avg as number | null;
      points.push({ time: point.time, x, y });
      if (typeof x === 'number' && typeof y === 'number') {
        xs.push(x);
        ys.push(y);
      }
    }

    res.json({
      points,
      pearson_r: pearsonR(xs, ys),
      count: xs.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load correlation' });
  }
});

router.get('/sleep', async (req: Request, res: Response) => {
  try {
    const { start, end } = parseRange(req);
    const sessions = await SleepModel.find({
      date: { $gte: start, $lte: end },
    })
      .sort({ date: -1 })
      .lean();

    const mappedSessions = sessions.map((session, index) => {
      const asleep = (session.core ?? 0) + (session.rem ?? 0) + (session.deep ?? 0);
      return {
        ID: index + 1,
        UserID: 0,
        Date: new Date(session.date).toISOString(),
        TotalSleep: asleep,
        Asleep: asleep,
        Core: session.core ?? 0,
        Deep: session.deep ?? 0,
        REM: session.rem ?? 0,
        InBed: session.inBed ?? 0,
        SleepStart: session.sleepStart ? new Date(session.sleepStart).toISOString() : '',
        SleepEnd: session.sleepEnd ? new Date(session.sleepEnd).toISOString() : '',
        InBedStart: session.inBedStart ? new Date(session.inBedStart).toISOString() : '',
        InBedEnd: session.inBedEnd ? new Date(session.inBedEnd).toISOString() : '',
      };
    });

    res.json({ sessions: mappedSessions, stages: [] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sleep data' });
  }
});

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
          Location: workout.distance ? 'Outdoor' : 'Unknown',
          IsIndoor: !workout.distance,
          ActiveEnergyBurned: workout.activeEnergyBurned?.qty ?? null,
          ActiveEnergyUnits: workout.activeEnergyBurned?.units ?? 'kcal',
          TotalEnergy: workout.activeEnergy?.qty ?? null,
          TotalEnergyUnits: workout.activeEnergy?.units ?? 'kcal',
          Distance: workout.distance?.qty ?? null,
          DistanceUnits: workout.distance?.units ?? 'mi',
          AvgHeartRate: avgHeartRate,
          MaxHeartRate: maxHeartRate,
          MinHeartRate: minHeartRate,
          ElevationUp: null,
          ElevationDown: null,
        };
      }),
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to load workouts' });
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
      Location: route ? 'Outdoor' : 'Unknown',
      IsIndoor: !route,
      ActiveEnergyBurned: workout.activeEnergyBurned?.qty ?? null,
      ActiveEnergyUnits: workout.activeEnergyBurned?.units ?? 'kcal',
      TotalEnergy: workout.activeEnergy?.qty ?? null,
      TotalEnergyUnits: workout.activeEnergy?.units ?? 'kcal',
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
      ElevationUp: null,
      ElevationDown: null,
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
