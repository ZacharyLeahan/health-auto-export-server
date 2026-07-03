export type WorkoutScale = 'snack' | 'real';

export const REAL_WORKOUT_MIN_DURATION_SECONDS = 15 * 60;

export function getWorkoutScale(durationSeconds: number): WorkoutScale {
  return durationSeconds > REAL_WORKOUT_MIN_DURATION_SECONDS ? 'real' : 'snack';
}
