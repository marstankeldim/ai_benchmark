/**
 * pass@k — the unbiased estimator from Chen et al., "Evaluating Large Language
 * Models Trained on Code" (2021).
 *
 * Naively estimating pass@k as "did any of the first k samples pass" is biased
 * and high-variance. Instead, given `n` total samples of which `c` passed, the
 * probability that a random size-k subset contains at least one passing sample is
 *
 *     pass@k = 1 − C(n−c, k) / C(n, k)
 *
 * We evaluate it in the numerically stable product form to avoid overflowing the
 * binomial coefficients for large n.
 */

/**
 * Unbiased pass@k for a single task.
 *
 * @param n total samples drawn for the task
 * @param c number of those samples that passed
 * @param k the k in pass@k
 */
export function passAtK(n: number, c: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(c) || !Number.isInteger(k)) {
    throw new Error("passAtK: n, c, k must be integers");
  }
  if (n < 0 || c < 0 || k < 0) throw new Error("passAtK: n, c, k must be non-negative");
  if (c > n) throw new Error(`passAtK: c (${c}) cannot exceed n (${n})`);
  if (k === 0 || n === 0) return 0;
  // If fewer than k samples failed, every size-k subset must contain a pass.
  if (n - c < k) return 1;

  // pass@k = 1 − ∏_{i=n−c+1}^{n} (1 − k/i)
  let product = 1;
  for (let i = n - c + 1; i <= n; i++) {
    product *= 1 - k / i;
  }
  return 1 - product;
}

/** A per-task tally of how many samples were drawn and how many passed. */
export interface TaskTally {
  n: number;
  c: number;
}

/**
 * Corpus-level pass@k: the mean of per-task {@link passAtK} over every task.
 * Tasks whose sample count is below k are skipped (pass@k is undefined there),
 * matching the HumanEval reference implementation.
 */
export function passAtKCorpus(tallies: readonly TaskTally[], k: number): number {
  const usable = tallies.filter((t) => t.n >= k);
  if (usable.length === 0) return 0;
  let total = 0;
  for (const t of usable) total += passAtK(t.n, t.c, k);
  return total / usable.length;
}

/** Convenience: tally a boolean pass/fail vector for one task into `{ n, c }`. */
export function tally(passes: readonly boolean[]): TaskTally {
  let c = 0;
  for (const p of passes) if (p) c++;
  return { n: passes.length, c };
}
