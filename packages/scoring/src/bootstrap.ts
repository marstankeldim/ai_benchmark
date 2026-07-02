/**
 * Nonparametric bootstrap confidence intervals.
 *
 * A point estimate (accuracy = 0.71) means little without a sense of how much it
 * would move on a fresh sample. The bootstrap answers that empirically: resample
 * the observed data with replacement many times, recompute the statistic, and
 * read the interval off the resampled distribution's percentiles. It needs no
 * distributional assumptions, which is exactly right for the skewed, bounded
 * metrics we deal with (proportions, pass@k, latency).
 *
 * All randomness flows through a seedable {@link Rng} so a run's intervals are
 * reproducible.
 */

import type { Interval } from "@evalforge/shared";
import { createRng, type Rng } from "@evalforge/shared";
import { mean, quantile } from "./descriptive.js";

export interface BootstrapOptions {
  /** Number of resamples. Default 2000 — a good accuracy/speed trade-off. */
  iterations?: number;
  /** Confidence level in (0, 1). Default 0.95. */
  level?: number;
  /** Statistic to bootstrap. Default: the mean. */
  statistic?: (sample: readonly number[]) => number;
  /** Seeded RNG (or a seed). Default: a fresh RNG seeded at 0. */
  rng?: Rng | string | number;
}

function resolveRng(rng: BootstrapOptions["rng"]): Rng {
  if (rng && typeof rng === "object") return rng;
  return createRng(rng ?? 0);
}

/** Draw one bootstrap resample (with replacement) of the same size as `sample`. */
function resample(sample: readonly number[], rng: Rng, out: number[]): number[] {
  const n = sample.length;
  for (let i = 0; i < n; i++) out[i] = sample[rng.int(0, n - 1)]!;
  return out;
}

/**
 * Percentile bootstrap CI for a statistic of a single sample.
 * Returns a degenerate interval `[x, x]` for a one-element sample.
 */
export function bootstrapCi(sample: readonly number[], options: BootstrapOptions = {}): Interval {
  const { iterations = 2000, level = 0.95, statistic = mean } = options;
  if (sample.length === 0) throw new Error("bootstrapCi: empty sample");
  const rng = resolveRng(options.rng);

  if (sample.length === 1) {
    const v = sample[0]!;
    return { low: v, high: v, level, method: "bootstrap" };
  }

  const stats = new Array<number>(iterations);
  const buffer = new Array<number>(sample.length);
  for (let b = 0; b < iterations; b++) {
    stats[b] = statistic(resample(sample, rng, buffer));
  }
  stats.sort((a, b) => a - b);

  const alpha = 1 - level;
  return {
    low: quantile(stats, alpha / 2),
    high: quantile(stats, 1 - alpha / 2),
    level,
    method: "bootstrap",
  };
}

/**
 * Paired bootstrap CI for the difference of means between two aligned samples
 * (the same tasks scored by two models). Resampling *task indices* — not the two
 * samples independently — preserves the per-item pairing, which is what gives the
 * paired test its power when models succeed and fail on the same items.
 */
export function pairedBootstrapDeltaCi(
  a: readonly number[],
  b: readonly number[],
  options: BootstrapOptions = {},
): Interval {
  if (a.length !== b.length) throw new Error("pairedBootstrapDeltaCi: length mismatch");
  if (a.length === 0) throw new Error("pairedBootstrapDeltaCi: empty samples");
  const { iterations = 2000, level = 0.95 } = options;
  const rng = resolveRng(options.rng);
  const n = a.length;

  const deltas = new Array<number>(iterations);
  for (let iter = 0; iter < iterations; iter++) {
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < n; i++) {
      const idx = rng.int(0, n - 1);
      sa += a[idx]!;
      sb += b[idx]!;
    }
    deltas[iter] = (sa - sb) / n;
  }
  deltas.sort((x, y) => x - y);

  const alpha = 1 - level;
  return {
    low: quantile(deltas, alpha / 2),
    high: quantile(deltas, 1 - alpha / 2),
    level,
    method: "bootstrap",
  };
}
