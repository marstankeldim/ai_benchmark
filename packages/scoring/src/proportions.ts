/**
 * Interval estimates and effect sizes for *proportions* — the shape most eval
 * metrics take (accuracy, pass rate). For binary outcomes the Wilson score
 * interval is far better-behaved than the textbook normal ("Wald") interval:
 * it stays inside [0, 1], and it is sensible even at small n or when the observed
 * rate is 0 or 1, where Wald collapses to a zero-width interval.
 */

import type { Interval } from "@evalforge/shared";

/** Two-sided standard-normal quantiles for the confidence levels we use most. */
const Z: Record<string, number> = {
  "0.9": 1.6448536269514722,
  "0.95": 1.959963984540054,
  "0.99": 2.5758293035489004,
};

/** Standard-normal inverse CDF (Acklam's rational approximation). */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`normalQuantile: p must be in (0,1), got ${p}`);
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
  );
}

/** z critical value for a two-sided interval at the given confidence level. */
function zFor(level: number): number {
  return Z[String(level)] ?? normalQuantile(1 - (1 - level) / 2);
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * @param successes number of positive outcomes
 * @param n         number of trials
 * @param level     confidence level (default 0.95)
 */
export function wilsonInterval(successes: number, n: number, level = 0.95): Interval {
  if (n <= 0) return { low: 0, high: 0, level, method: "wilson" };
  const z = zFor(level);
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom;
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    level,
    method: "wilson",
  };
}

/**
 * Cohen's h — the standardized effect size for the difference between two
 * proportions. Uses the arcsine (variance-stabilizing) transform so the effect
 * is comparable across the whole [0, 1] range. |h| ≈ 0.2 small, 0.5 medium,
 * 0.8 large.
 */
export function cohenH(p1: number, p2: number): number {
  const phi = (p: number): number => 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, p))));
  return phi(p1) - phi(p2);
}
