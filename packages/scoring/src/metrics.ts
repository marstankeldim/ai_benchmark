/**
 * Point metrics over per-example outcomes.
 *
 * Everything here reduces a list of example-level results to a single scalar in
 * [0, 1] (plus token-overlap F1 for free-text). Uncertainty around these
 * scalars lives in {@link ./bootstrap} and {@link ./proportions}.
 */

import { mean } from "./descriptive.js";

/** Mean of per-example scores (already in [0, 1]). Empty input → 0. */
export function accuracy(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return mean(scores);
}

/** Fraction of `true` outcomes. Empty input → 0. */
export function passRate(passed: readonly boolean[]): number {
  if (passed.length === 0) return 0;
  let hits = 0;
  for (const p of passed) if (p) hits++;
  return hits / passed.length;
}

/**
 * Fraction of predictions that exactly equal their gold reference. Comparison
 * is strict equality after optional trimming — normalization beyond that is a
 * caller concern.
 */
export function exactMatchRate(
  predictions: readonly string[],
  gold: readonly string[],
  options: { trim?: boolean } = {},
): number {
  if (predictions.length !== gold.length) {
    throw new Error("exactMatchRate: predictions and gold length mismatch");
  }
  if (predictions.length === 0) return 0;
  const { trim = true } = options;
  const norm = (s: string): string => (trim ? s.trim() : s);
  let hits = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (norm(predictions[i]!) === norm(gold[i]!)) hits++;
  }
  return hits / predictions.length;
}

/** Token-level F1 result with its precision/recall components. */
export interface F1Result {
  precision: number;
  recall: number;
  f1: number;
}

/**
 * Token-overlap F1 between a predicted and a gold token multiset (the SQuAD /
 * QA convention). Overlap counts each shared token up to its minimum
 * multiplicity in the two bags. Two empty inputs score a perfect 1 (both said
 * "nothing" and agreed); one empty against a non-empty scores 0.
 */
export function f1Score(
  predTokens: readonly string[],
  goldTokens: readonly string[],
): F1Result {
  if (predTokens.length === 0 && goldTokens.length === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  if (predTokens.length === 0 || goldTokens.length === 0) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  const goldCounts = new Map<string, number>();
  for (const t of goldTokens) goldCounts.set(t, (goldCounts.get(t) ?? 0) + 1);

  let overlap = 0;
  for (const t of predTokens) {
    const remaining = goldCounts.get(t);
    if (remaining && remaining > 0) {
      overlap++;
      goldCounts.set(t, remaining - 1);
    }
  }

  const precision = overlap / predTokens.length;
  const recall = overlap / goldTokens.length;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

/** Default whitespace tokenizer used by {@link f1FromText}: lowercase, split on runs of non-word chars. */
function defaultTokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Convenience wrapper: tokenize two free-text strings and compute token F1.
 * A custom `tokenize` may be supplied to match a task's own normalization.
 */
export function f1FromText(
  a: string,
  b: string,
  tokenize: (text: string) => string[] = defaultTokenize,
): F1Result {
  return f1Score(tokenize(a), tokenize(b));
}

/**
 * Reward-per-token helper for the `tokenEfficiency` metric: how much "correct"
 * we bought per completion token. Zero credit for an incorrect answer, and zero
 * (rather than infinity) when no tokens were spent.
 */
export function tokenEfficiency(correct: boolean, completionTokens: number): number {
  if (!correct || completionTokens <= 0) return 0;
  return 1 / completionTokens;
}
