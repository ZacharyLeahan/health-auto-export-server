/** Compute a simple moving average with the given window size. */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      if (values[j] != null) {
        sum += values[j]!;
        count++;
      }
    }
    result.push(count > 0 ? sum / count : null);
  }
  return result;
}

/** Check if a value is an outlier relative to mean +/- threshold * stddev. */
export function isOutlier(
  value: number | null,
  mean: number,
  stddev: number,
  threshold: number = 1.5,
): boolean {
  if (value == null || stddev === 0) return false;
  return Math.abs(value - mean) > threshold * stddev;
}
