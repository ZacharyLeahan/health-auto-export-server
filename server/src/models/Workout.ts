import mongoose, { Schema, Document } from 'mongoose';

interface IQuantity {
  qty: number;
  units: string;
  source?: string;
}

interface IQuantityMetric extends IQuantity {
  date: Date;
}

interface IHeartRate {
  Min: number;
  Avg: number;
  Max: number;
  date: Date;
  units: string;
  source?: string;
}

interface IHeartRateSummary {
  min?: IQuantity;
  avg?: IQuantity;
  max?: IQuantity;
}

interface ILocation {
  latitude: number;
  longitude: number;
  course?: number;
  courseAccuracy?: number;
  speed?: number;
  speedAccuracy?: number;
  altitude?: number;
  verticalAccuracy?: number;
  horizontalAccuracy?: number;
  timestamp: Date;
}

interface IRoute {
  workoutId: string;
  locations: ILocation[];
}

/**
 * Health Auto Export workout JSON, export version 2.
 *
 * Workout summary values are objects while "Include Workout Metrics" values
 * are time-series arrays. The schema uses strict:false so newly-added exporter
 * fields are retained until this model is updated.
 */
export interface WorkoutData {
  id: string;
  name: string;
  start: Date;
  end: Date;
  duration: number;
  location?: string;
  isIndoor?: boolean;
  activeEnergyBurned?: IQuantity;
  totalEnergy?: IQuantity;
  distance?: IQuantity;
  speed?: IQuantity;
  avgSpeed?: IQuantity;
  maxSpeed?: IQuantity;
  elevationUp?: IQuantity;
  elevationDown?: IQuantity;
  temperature?: IQuantity;
  humidity?: IQuantity;
  intensity?: IQuantity;
  lapLength?: IQuantity;
  stepCadence?: IQuantity;
  flightsClimbed?: IQuantity;
  totalSwimmingStrokeCount?: IQuantity;
  swimCadence?: IQuantity;
  strokeStyle?: string;
  swolfScore?: number;
  salinity?: string;
  maxHeartRate?: IQuantity;
  avgHeartRate?: IQuantity;
  heartRate?: IHeartRateSummary;
  heartRateData?: IHeartRate[];
  heartRateRecovery?: IHeartRate[];
  activeEnergy?: IQuantityMetric[];
  basalEnergy?: IQuantityMetric[];
  stepCount?: IQuantityMetric[];
  cyclingCadence?: IQuantityMetric[];
  cyclingDistance?: IQuantityMetric[];
  cyclingPower?: IQuantityMetric[];
  cyclingSpeed?: IQuantityMetric[];
  swimDistance?: IQuantityMetric[];
  swimStroke?: IQuantityMetric[];
  walkingAndRunningDistance?: IQuantityMetric[];
  route?: ILocation[];
  metadata?: Record<string, unknown>;
}

interface IWorkout extends Document, Omit<WorkoutData, 'id' | 'route'> {
  workoutId: string;
  createdAt: Date;
  updatedAt: Date;
}

const QuantitySchema = new Schema<IQuantity>(
  {
    qty: { type: Number, required: true },
    units: { type: String, required: true },
    source: { type: String, required: false },
  },
  { _id: false },
);

const QuantityMetricSchema = new Schema<IQuantityMetric>(
  {
    qty: { type: Number, required: true },
    units: { type: String, required: true },
    date: { type: Date, required: true },
    source: { type: String, required: false },
  },
  { _id: false },
);

const HeartRateSchema = new Schema<IHeartRate>(
  {
    Min: { type: Number, required: true, min: 0 },
    Avg: { type: Number, required: true, min: 0 },
    Max: { type: Number, required: true, min: 0 },
    date: { type: Date, required: true },
    units: { type: String, required: true },
    source: { type: String, required: false },
  },
  { _id: false },
);

const HeartRateSummarySchema = new Schema<IHeartRateSummary>(
  {
    min: { type: QuantitySchema, required: false },
    avg: { type: QuantitySchema, required: false },
    max: { type: QuantitySchema, required: false },
  },
  { _id: false },
);

const timeSeriesFields = [
  'activeEnergy',
  'basalEnergy',
  'stepCount',
  'cyclingCadence',
  'cyclingDistance',
  'cyclingPower',
  'cyclingSpeed',
  'swimDistance',
  'swimStroke',
  'walkingAndRunningDistance',
] as const;

const WorkoutSchema = new Schema<IWorkout>(
  {
    workoutId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    duration: { type: Number, required: true, min: 0 },
    location: { type: String, required: false },
    isIndoor: { type: Boolean, required: false },
    activeEnergyBurned: { type: QuantitySchema, required: false },
    totalEnergy: { type: QuantitySchema, required: false },
    distance: { type: QuantitySchema, required: false },
    speed: { type: QuantitySchema, required: false },
    avgSpeed: { type: QuantitySchema, required: false },
    maxSpeed: { type: QuantitySchema, required: false },
    elevationUp: { type: QuantitySchema, required: false },
    elevationDown: { type: QuantitySchema, required: false },
    temperature: { type: QuantitySchema, required: false },
    humidity: { type: QuantitySchema, required: false },
    intensity: { type: QuantitySchema, required: false },
    lapLength: { type: QuantitySchema, required: false },
    stepCadence: { type: QuantitySchema, required: false },
    flightsClimbed: { type: QuantitySchema, required: false },
    totalSwimmingStrokeCount: { type: QuantitySchema, required: false },
    swimCadence: { type: QuantitySchema, required: false },
    maxHeartRate: { type: QuantitySchema, required: false },
    avgHeartRate: { type: QuantitySchema, required: false },
    heartRate: { type: HeartRateSummarySchema, required: false },
    heartRateData: { type: [HeartRateSchema], required: false },
    heartRateRecovery: { type: [HeartRateSchema], required: false },
    activeEnergy: { type: [QuantityMetricSchema], required: false },
    basalEnergy: { type: [QuantityMetricSchema], required: false },
    stepCount: { type: [QuantityMetricSchema], required: false },
    cyclingCadence: { type: [QuantityMetricSchema], required: false },
    cyclingDistance: { type: [QuantityMetricSchema], required: false },
    cyclingPower: { type: [QuantityMetricSchema], required: false },
    cyclingSpeed: { type: [QuantityMetricSchema], required: false },
    swimDistance: { type: [QuantityMetricSchema], required: false },
    swimStroke: { type: [QuantityMetricSchema], required: false },
    walkingAndRunningDistance: { type: [QuantityMetricSchema], required: false },
    strokeStyle: { type: String, required: false },
    swolfScore: { type: Number, required: false },
    salinity: { type: String, required: false },
    metadata: { type: Schema.Types.Mixed, required: false },
  },
  {
    timestamps: true,
    // Keep additional Version 2 workout metrics that newer app versions add.
    strict: false,
  },
);

const locationSchema = new Schema<ILocation>(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    timestamp: { type: Date, required: true },
    course: { type: Number, required: false },
    courseAccuracy: { type: Number, required: false },
    speed: { type: Number, required: false },
    speedAccuracy: { type: Number, required: false },
    altitude: { type: Number, required: false },
    verticalAccuracy: { type: Number, required: false },
    horizontalAccuracy: { type: Number, required: false },
  },
  { _id: false },
);

const routeSchema = new Schema<IRoute>(
  {
    workoutId: { type: String, required: true, unique: true, index: true },
    locations: {
      type: [locationSchema],
      required: true,
      validate: {
        validator: (locations: ILocation[]) => locations.length > 0,
        message: 'Locations array must contain at least one point',
      },
    },
  },
  { timestamps: true },
);

const parseDate = (value: unknown): Date => new Date(value as string | Date);

export function mapWorkoutData(data: WorkoutData) {
  const { id, ...rest } = data;
  const mapped: Record<string, unknown> = {
    ...rest,
    workoutId: id,
    start: parseDate(rest.start),
    end: parseDate(rest.end),
  };
  delete mapped.route;

  for (const field of [...timeSeriesFields, 'heartRateData', 'heartRateRecovery'] as const) {
    const values = mapped[field];
    if (Array.isArray(values)) {
      mapped[field] = values.map((value) => ({
        ...value,
        date: parseDate(value.date),
      }));
    }
  }

  return mapped;
}

export function mapRoute(data: WorkoutData) {
  return {
    workoutId: data.id,
    locations: data.route?.map((location) => ({
      ...location,
      timestamp: parseDate(location.timestamp),
    })),
  };
}

export const WorkoutModel = mongoose.model<IWorkout>('Workout', WorkoutSchema, 'workouts');
export const RouteModel = mongoose.model<IRoute>('Route', routeSchema, 'workout_routes');
