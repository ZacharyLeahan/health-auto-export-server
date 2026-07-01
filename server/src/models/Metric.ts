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
  source: string;
  metadata?: Record<string, string>;
}

export interface BloodPressureMetric {
  systolic: number;
  diastolic: number;
  units: string;
  date: Date;
  source: string;
  metadata?: Record<string, string>;
}

export interface HeartRateMetric {
  Min: number;
  Avg: number;
  Max: number;
  units: string;
  date: Date;
  source: string;
  metadata?: Record<string, string>;
}

export interface SleepMetric {
  date: Date;
  inBedStart?: Date | null;
  inBedEnd?: Date | null;
  sleepStart?: Date | null;
  sleepEnd?: Date | null;
  core: number;
  rem: number;
  deep: number;
  awake: number;
  inBed: number;
  units: string;
  source: string;
  metadata?: Record<string, string>;
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
      const sleepData = metric.data as SleepMetric[];
      return sleepData
        .map((measurement) => ({
          date: new Date(measurement.date),
          inBedStart: parseOptionalDate(measurement.inBedStart),
          inBedEnd: parseOptionalDate(measurement.inBedEnd),
          sleepStart: parseOptionalDate(measurement.sleepStart),
          sleepEnd: parseOptionalDate(measurement.sleepEnd),
          core: measurement.core,
          rem: measurement.rem,
          deep: measurement.deep,
          awake: measurement.awake,
          inBed: measurement.inBed,
          units: metric.units,
          source: measurement.source,
          metadata: measurement.metadata,
        }))
        .filter((measurement) => !Number.isNaN(measurement.date.getTime()));
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
  source: { type: String, required: true },
  metadata: { type: Object, required: false },
});

BaseMetricSchema.index({ date: 1, source: 1 }, { unique: true });

// Blood Pressure Schema
const BloodPressureSchema: Schema = new Schema({
  systolic: { type: Number, required: true },
  diastolic: { type: Number, required: true },
  units: { type: String, required: true },
  date: { type: Date, required: true },
  source: { type: String, required: true },
  metadata: { type: Object, required: false },
});

BloodPressureSchema.index({ date: 1, source: 1 }, { unique: true });

// Heart Rate Schema
const HeartRateSchema: Schema = new Schema({
  Min: { type: Number, required: true },
  Avg: { type: Number, required: true },
  Max: { type: Number, required: true },
  units: { type: String, required: true },
  date: { type: Date, required: true },
  source: { type: String, required: true },
  metadata: { type: Object, required: false },
});

HeartRateSchema.index({ date: 1, source: 1 }, { unique: true });

// Sleep Schema
const SleepSchema: Schema = new Schema({
  date: { type: Date, required: true },
  inBedStart: { type: Date, required: false },
  inBedEnd: { type: Date, required: false },
  sleepStart: { type: Date, required: false },
  sleepEnd: { type: Date, required: false },
  core: { type: Number, required: true },
  rem: { type: Number, required: true },
  deep: { type: Number, required: true },
  awake: { type: Number, required: true },
  inBed: { type: Number, required: true },
  units: { type: String, required: true },
  source: { type: String, required: true },
  metadata: { type: Object, required: false },
});

SleepSchema.index({ date: 1, source: 1 }, { unique: true });

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
