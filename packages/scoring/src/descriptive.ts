/**
 * Descriptive statistics over numeric samples.
 *
 * These are the primitives every other module builds on. All functions treat
 * their input as a finite population sample; where the distinction matters
 * (`std`) the sample/population choice is explicit.
 */

import type { DistributionSummary } from "@evalforge/shared";

/** Sum of a sample. Empty sample sums to 0. */
export function sum(xs: readonly number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

/** Arithmetic mean. Throws on an empty sample (a mean is undefined there). */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("mean: empty sample");
  return sum(xs) / xs.length;
}

/**
 * Variance. `sample=true` (default) applies Bessel's correction (n−1 divisor),
 * the unbiased estimator; `sample=false` uses the population divisor n.
 * Returns 0 when fewer than 2 observations are available for the sample form.
 */
export function variance(xs: readonly number[], sample = true): number {
  const n = xs.length;
  if (n === 0) throw new Error("variance: empty sample");
  const divisor = sample ? n - 1 : n;
  if (divisor <= 0) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return ss / divisor;
}

/** Standard deviation — the square root of {@link variance}. */
export function std(xs: readonly number[], sample = true): number {
  return Math.sqrt(variance(xs, sample));
}

/** Smallest value. Throws on an empty sample. */
export function min(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("min: empty sample");
  let m = xs[0]!;
  for (const x of xs) if (x < m) m = x;
  return m;
}

/** Largest value. Throws on an empty sample. */
export function max(xs: readonly number[]): number {
  if (xs.length === 0) throw new Error("max: empty sample");
  let m = xs[0]!;
  for (const x of xs) if (x > m) m = x;
  return m;
}

/**
 * The q-th quantile (0 ≤ q ≤ 1) using linear interpolation between the two
 * closest ranks (the "R-7" / Excel `PERCENTILE.INC` convention). Sorting is
 * done on a copy, so the caller's array is untouched.
 */
export function quantile(xs: readonly number[], q: number): number {
  if (xs.length === 0) throw new Error("quantile: empty sample");
  if (q < 0 || q > 1) throw new Error(`quantile: q must be in [0,1], got ${q}`);
  const sorted = xs.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * frac;
}

/** The median — the 0.5 quantile. */
export function median(xs: readonly number[]): number {
  return quantile(xs, 0.5);
}

/**
 * Roll a sample up into a {@link DistributionSummary}. Computes each order
 * statistic from a single sort by reusing the interpolating {@link quantile}.
 */
export function summarize(xs: readonly number[]): DistributionSummary {
  if (xs.length === 0) throw new Error("summarize: empty sample");
  const sorted = xs.slice().sort((a, b) => a - b);
  const q = (p: number): number => quantile(sorted, p);
  return {
    n: sorted.length,
    mean: mean(sorted),
    std: std(sorted, true),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    median: q(0.5),
    p25: q(0.25),
    p75: q(0.75),
    p95: q(0.95),
  };
}
