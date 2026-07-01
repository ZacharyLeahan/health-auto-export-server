import mongoose, { Schema, Document } from 'mongoose';

import { MetricName } from './MetricName';

export interface MetricData {
  name: string;
  units: string;
  data: Metric[];
}

export interface BaseMetric {
  qty: number;
  units: string;
  date: Date;
  source?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BloodPressureMetric {
  systolic: number;
  diastolic: number;
  units: string;
  date: Date;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface HeartRateMetric {
  Min: number;
  Avg: number;
  Max: number;
  units: string;
  date: Date;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface SleepMetric {
  date: Date;
  endDate?: Date | null;
  stage?: string;
  qty?: number;
  inBedStart?: Date | null;
  inBedEnd?: Date | null;
  sleepStart?: Date | null;
  sleepEnd?: Date | null;
  core?: number;
  rem?: number;
  deep?: number;
  awake?: number;
  inBed?: number;
  totalSleep?: number;
  asleep?: number;
  units: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

const parseOptionalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const parsed = new Date(value as string | Date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const mapMetric = (
  metric: MetricData,
): (Metric | BloodPressureMetric | SleepMetric | HeartRateMetric)[] => {
  switch (metric.name) {
    case MetricName.BLOOD_PRESSURE:
      const bpData = metric.data as BloodPressureMetric[];
      return bpData.map((measurement) => ({
        systolic: measurement.systolic,
        diastolic: measurement.diastolic,
        units: metric.units,
        date: new Date(measurement.date),
        source: measurement.source,
        metadata: measurement.metadata,
      }));
    case MetricName.HEART_RATE:
      const hrData = metric.data as HeartRateMetric[];
      return hrData.map((measurement) => ({
        Min: measurement.Min,
        Avg: measurement.Avg,
        Max: measurement.Max,
        units: metric.units,
        date: new Date(measurement.date),
        source: measurement.source,
        metadata: measurement.metadata,
      }));
    case MetricName.SLEEP_ANALYSIS:
      const sleepData = metric.data as unknown as Record<string, unknown>[];
      return sleepData
        .map((measurement): SleepMetric | null => {
          const source =
            typeof measurement.source === 'string' ? measurement.source : undefined;
          const dateRaw = measurement.date ?? measurement.startDate;
          const date = new Date(dateRaw as string | Date);
          if (Number.isNaN(date.getTime())) return null;

          const endDate = parseOptionalDate(measurement.endDate);
          const stage = typeof measurement.value === 'string' ? measurement.value : undefined;
          const qty = typeof measurement.qty === 'number' ? measurement.qty : 0;

          const core =
            typeof measurement.core === 'number' ? measurement.core : stage === 'Core' ? qty : 0;
          const rem =
            typeof measurement.rem === 'number' ? measurement.rem : stage === 'REM' ? qty : 0;
          const deep =
            typeof measurement.deep === 'number' ? measurement.deep : stage === 'Deep' ? qty : 0;
          const awake =
            typeof measurement.awake === 'number' ? measurement.awake : stage === 'Awake' ? qty : 0;
          const inBed =
            typeof measurement.inBed === 'number'
              ? measurement.inBed
              : stage === 'In Bed'
                ? qty
                : typeof measurement.asleep === 'number'
                  ? measurement.asleep
                  : 0;

          return {
            date,
            endDate,
            stage,
            qty: qty || undefined,
            inBedStart: parseOptionalDate(measurement.inBedStart),
            inBedEnd: parseOptionalDate(measurement.inBedEnd),
            sleepStart: parseOptionalDate(measurement.sleepStart),
            sleepEnd: parseOptionalDate(measurement.sleepEnd),
            core,
            rem,
            deep,
            awake,
            inBed,
            totalSleep:
              typeof measurement.totalSleep === 'number' ? measurement.totalSleep : undefined,
            asleep: typeof measurement.asleep === 'number' ? measurement.asleep : undefined,
            units: metric.units,
            source,
            metadata: measurement.metadata as Record<string, unknown> | undefined,
          };
        })
        .filter((measurement): measurement is SleepMetric => measurement !== null) as Metric[];
    default:
      const baseData = metric.data as BaseMetric[];
      return baseData.map((measurement) => ({
        qty: measurement.qty,
        units: metric.units,
        date: new Date(measurement.date),
        source: measurement.source,
        metadata: measurement.metadata,
      }));
  }
};

export type Metric = BaseMetric | BloodPressureMetric | SleepMetric | HeartRateMetric;

// Separate interfaces for documents
interface IMetric extends BaseMetric, Document {}
interface IBloodPressureMetric extends BloodPressureMetric, Document {}
interface IHeartRateMetric extends HeartRateMetric, Document {}
interface ISleepMetric extends SleepMetric, Document {}

// Base Metric Schema
const BaseMetricSchema: Schema = new Schema({
  qty: { type: Number, required: true },
  units: { type: String, required: true },
  date: { type: Date, required: true },
  source: { type: String, required: false },
  metadata: { type: Object, required: false },
}, { strict: false });

BaseMetricSchema.index({ date: 1, source: 1 }, { unique: true });

// Blood Pressure Schema
const BloodPressureSchema: Schema = new Schema({
  systolic: { type: Number, required: true },
  diastolic: { type: Number, required: true },
  units: { type: String, required: true },
  date: { type: Date, required: true },
  source: { type: String, required: false },
  metadata: { type: Object, required: false },
}, { strict: false });

BloodPressureSchema.index({ date: 1, source: 1 }, { unique: true });

// Heart Rate Schema
const HeartRateSchema: Schema = new Schema({
  Min: { type: Number, required: true },
  Avg: { type: Number, required: true },
  Max: { type: Number, required: true },
  units: { type: String, required: true },
  date: { type: Date, required: true },
  source: { type: String, required: false },
  metadata: { type: Object, required: false },
}, { strict: false });

HeartRateSchema.index({ date: 1, source: 1 }, { unique: true });

// Sleep Schema
const SleepSchema: Schema = new Schema({
  date: { type: Date, required: true },
  endDate: { type: Date, required: false },
  stage: { type: String, required: false },
  qty: { type: Number, required: false },
  inBedStart: { type: Date, required: false },
  inBedEnd: { type: Date, required: false },
  sleepStart: { type: Date, required: false },
  sleepEnd: { type: Date, required: false },
  core: { type: Number, required: false, default: 0 },
  rem: { type: Number, required: false, default: 0 },
  deep: { type: Number, required: false, default: 0 },
  awake: { type: Number, required: false, default: 0 },
  inBed: { type: Number, required: false, default: 0 },
  totalSleep: { type: Number, required: false },
  asleep: { type: Number, required: false },
  units: { type: String, required: true },
  source: { type: String, required: false },
  metadata: { type: Object, required: false },
}, { strict: false });

SleepSchema.index({ date: 1, source: 1, stage: 1, endDate: 1 }, { unique: true });

export const createMetricModel = (name: MetricName) => {
  return mongoose.model<IMetric>(String(name), BaseMetricSchema, String(name));
};

export const BloodPressureModel = mongoose.model<IBloodPressureMetric>(
  'BloodPressure',
  BloodPressureSchema,
  'blood_pressure',
);
export const HeartRateModel = mongoose.model<IHeartRateMetric>(
  'HeartRate',
  HeartRateSchema,
  'heart_rate',
);
export const SleepModel = mongoose.model<ISleepMetric>(
  'SleepAnalysis',
  SleepSchema,
  'sleep_analysis',
);
