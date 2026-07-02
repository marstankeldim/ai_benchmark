/**
 * Effect sizes for continuous samples. A p-value tells you whether a difference
 * is distinguishable from noise; an effect size tells you whether it *matters*.
 */

import { mean, variance } from "./descriptive.js";

/**
 * Cohen's d for two independent samples, using the pooled standard deviation.
 * Returns 0 when the pooled variance is 0 (both samples constant). Conventional
 * anchors: 0.2 small, 0.5 medium, 0.8 large.
 */
export function cohenD(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) throw new Error("cohenD: empty sample");
  const na = a.length;
  const nb = b.length;
  if (na + nb <= 2) return 0;
  const va = variance(a, true);
  const vb = variance(b, true);
  const pooledVar = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
  if (pooledVar <= 0) return 0;
  return (mean(a) - mean(b)) / Math.sqrt(pooledVar);
}

/**
 * Cohen's d for *paired* samples: standardize the mean difference by the standard
 * deviation of the per-item differences. Appropriate when the same tasks are
 * scored by two models.
 */
export function pairedCohenD(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error("pairedCohenD: length mismatch");
  if (a.length === 0) throw new Error("pairedCohenD: empty sample");
  const diffs = a.map((x, i) => x - b[i]!);
  if (diffs.length < 2) return 0;
  const sd = Math.sqrt(variance(diffs, true));
  if (sd <= 0) return 0;
  return mean(diffs) / sd;
}
