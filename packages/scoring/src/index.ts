/**
 * @evalforge/scoring — the numbers you can defend.
 *
 * Two layers, both pure and seedable:
 *  - **Point metrics** (`metrics`, `passk`): accuracy, exact match, token F1,
 *    pass@k (unbiased), token efficiency.
 *  - **Inferential statistics** (`descriptive`, `bootstrap`, `proportions`,
 *    `effect`, `significance`, `elo`): distribution summaries, bootstrap &
 *    paired-bootstrap CIs, Wilson intervals, Cohen's d/h, paired permutation /
 *    McNemar / Welch tests, and Elo / Bradley–Terry rankings.
 *
 * Nothing here performs I/O, so every function is trivially unit-testable and
 * reproducible given a seed.
 */

export * from "./descriptive.js";
export * from "./metrics.js";
export * from "./passk.js";
export * from "./bootstrap.js";
export * from "./proportions.js";
export * from "./effect.js";
export * from "./significance.js";
export * from "./elo.js";
