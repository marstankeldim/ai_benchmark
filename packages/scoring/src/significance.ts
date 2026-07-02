/**
 * Model-vs-model significance testing on paired, per-item scores.
 *
 * When two models are evaluated on the *same* tasks, their scores are paired and
 * should be compared with paired tests — this cancels task-difficulty variance
 * and is much more powerful than treating the two score sets as independent. We
 * offer three complementary tools, all reported as a single {@link SignificanceTest}:
 *
 *  - paired permutation (sign-flip) test — exact-ish, assumption-light p-value;
 *  - McNemar's test — the right test for paired *binary* outcomes;
 *  - Welch's t-test — for unpaired means when pairing isn't available.
 *
 * The default {@link compareScores} picks the paired permutation test and attaches
 * a paired-bootstrap CI on the delta plus an appropriate effect size (Cohen's h
 * for proportions, Cohen's d for continuous scores).
 */

import type { Interval, SignificanceTest } from "@evalforge/shared";
import { createRng, type Rng } from "@evalforge/shared";
import { mean } from "./descriptive.js";
import { pairedBootstrapDeltaCi } from "./bootstrap.js";
import { cohenH } from "./proportions.js";
import { pairedCohenD } from "./effect.js";

const isBinary = (xs: readonly number[]): boolean => xs.every((x) => x === 0 || x === 1);

/**
 * Paired permutation test on the mean difference. Under the null (the two labels
 * are exchangeable within each item) each per-item difference may flip sign; we
 * approximate the permutation distribution by random sign flips and report the
 * two-sided p-value. With ≤ ~20 items we enumerate all 2^n sign assignments for
 * an exact p-value instead.
 */
export function pairedPermutationTest(
  a: readonly number[],
  b: readonly number[],
  options: { iterations?: number; rng?: Rng | string | number } = {},
): { pValue: number; delta: number } {
  if (a.length !== b.length) throw new Error("pairedPermutationTest: length mismatch");
  const n = a.length;
  if (n === 0) return { pValue: 1, delta: 0 };
  const diffs = a.map((x, i) => x - b[i]!);
  const observed = Math.abs(mean(diffs));

  // Exact enumeration when small enough to be cheap.
  if (n <= 20) {
    let atLeastAsExtreme = 0;
    const total = 2 ** n;
    for (let mask = 0; mask < total; mask++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += (mask & (1 << i)) === 0 ? diffs[i]! : -diffs[i]!;
      if (Math.abs(s / n) >= observed - 1e-12) atLeastAsExtreme++;
    }
    return { pValue: atLeastAsExtreme / total, delta: mean(diffs) };
  }

  const { iterations = 10000 } = options;
  const rng = options.rng && typeof options.rng === "object" ? options.rng : createRng(options.rng ?? 0);
  let atLeastAsExtreme = 0;
  for (let iter = 0; iter < iterations; iter++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += rng.next() < 0.5 ? diffs[i]! : -diffs[i]!;
    if (Math.abs(s / n) >= observed - 1e-12) atLeastAsExtreme++;
  }
  // Add-one smoothing so a Monte-Carlo p-value is never exactly 0.
  return { pValue: (atLeastAsExtreme + 1) / (iterations + 1), delta: mean(diffs) };
}

/**
 * McNemar's test for two paired binary classifiers. Only the *discordant* pairs
 * (one right, one wrong) carry information. Uses the exact binomial p-value,
 * which is correct even when discordant counts are small.
 */
export function mcnemarTest(a: readonly number[], b: readonly number[]): { pValue: number; delta: number } {
  if (a.length !== b.length) throw new Error("mcnemarTest: length mismatch");
  let b01 = 0; // a wrong, b right
  let b10 = 0; // a right, b wrong
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]! >= 0.5;
    const bi = b[i]! >= 0.5;
    if (ai && !bi) b10++;
    else if (!ai && bi) b01++;
  }
  const nDiscordant = b01 + b10;
  const delta = a.length > 0 ? mean(a) - mean(b) : 0;
  if (nDiscordant === 0) return { pValue: 1, delta };

  // Two-sided exact binomial p-value with p = 0.5.
  const k = Math.min(b01, b10);
  let tail = 0;
  for (let i = 0; i <= k; i++) tail += binomialPmf(nDiscordant, i, 0.5);
  return { pValue: Math.min(1, 2 * tail), delta };
}

function binomialPmf(n: number, k: number, p: number): number {
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

function logChoose(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

/** Welch's unequal-variance t-test for two independent means (unpaired). */
export function welchT(a: readonly number[], b: readonly number[]): { pValue: number; delta: number } {
  const na = a.length;
  const nb = b.length;
  if (na < 2 || nb < 2) return { pValue: 1, delta: na && nb ? mean(a) - mean(b) : 0 };
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (na - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (nb - 1);
  const se = Math.sqrt(va / na + vb / nb);
  if (se === 0) return { pValue: 1, delta: ma - mb };
  const t = (ma - mb) / se;
  const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  return { pValue: 2 * studentTSf(Math.abs(t), df), delta: ma - mb };
}

/** Upper-tail survival function of Student's t via the regularized incomplete beta. */
function studentTSf(t: number, df: number): number {
  const x = df / (df + t * t);
  return 0.5 * regularizedIncompleteBeta(x, df / 2, 0.5);
}

/** Regularized incomplete beta I_x(a,b) via Lentz's continued fraction. */
function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  const useComplement = x >= (a + 1) / (a + b + 2);
  if (useComplement) return 1 - regularizedIncompleteBeta(1 - x, b, a);

  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let f = d;
  for (let i = 1; i <= 200; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-12) break;
  }
  return front * (f - 1);
}

/** Lanczos approximation of ln Γ(x). */
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export interface CompareOptions {
  method?: SignificanceTest["method"];
  level?: number;
  alpha?: number;
  iterations?: number;
  rng?: Rng | string | number;
}

/**
 * Compare two models' aligned per-item scores and produce a full
 * {@link SignificanceTest}: delta, p-value, effect size, a CI on the delta, and a
 * significance flag. Defaults to the paired permutation test with a
 * paired-bootstrap CI — the assumption-light choice appropriate for bounded eval
 * metrics.
 */
export function compareScores(
  a: readonly number[],
  b: readonly number[],
  options: CompareOptions = {},
): SignificanceTest {
  const { method = "permutation", level = 0.95, alpha = 0.05 } = options;
  const binary = isBinary(a) && isBinary(b);

  let pValue: number;
  let delta: number;
  let interval: Interval | undefined;

  switch (method) {
    case "mcnemar": {
      ({ pValue, delta } = mcnemarTest(a, b));
      break;
    }
    case "welch-t": {
      ({ pValue, delta } = welchT(a, b));
      break;
    }
    case "paired-bootstrap": {
      interval = pairedBootstrapDeltaCi(a, b, { level, ...(options.rng ? { rng: options.rng } : {}) });
      // A CI-based two-sided p-value: does the delta CI exclude 0?
      const perm = pairedPermutationTest(a, b, {
        ...(options.iterations ? { iterations: options.iterations } : {}),
        ...(options.rng ? { rng: options.rng } : {}),
      });
      pValue = perm.pValue;
      delta = perm.delta;
      break;
    }
    case "permutation":
    default: {
      ({ pValue, delta } = pairedPermutationTest(a, b, {
        ...(options.iterations ? { iterations: options.iterations } : {}),
        ...(options.rng ? { rng: options.rng } : {}),
      }));
      break;
    }
  }

  if (!interval && a.length === b.length && a.length > 1) {
    interval = pairedBootstrapDeltaCi(a, b, { level, ...(options.rng ? { rng: options.rng } : {}) });
  }

  const effectSize = binary
    ? cohenH(mean(a), mean(b))
    : a.length === b.length
      ? pairedCohenD(a, b)
      : 0;

  return {
    delta,
    pValue,
    effectSize,
    significant: pValue < alpha,
    ...(interval ? { interval } : {}),
    method,
  };
}
