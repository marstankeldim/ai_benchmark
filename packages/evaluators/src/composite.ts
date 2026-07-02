/**
 * Composite judge — a weighted combination of sub-judges. Useful when a task has
 * several graded dimensions (e.g. "is it valid JSON" AND "does it contain the key
 * fact"), or to blend a cheap deterministic check with an LLM-judge tie-breaker.
 */

import type { Evaluator, GradeInput, GradeResult } from "@evalforge/shared";

export interface WeightedEvaluator {
  evaluator: Evaluator;
  weight: number;
}

export class CompositeEvaluator implements Evaluator {
  readonly kind = "composite" as const;
  private readonly totalWeight: number;

  constructor(private readonly components: WeightedEvaluator[]) {
    this.totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
  }

  async grade(input: GradeInput): Promise<GradeResult> {
    const results = await Promise.all(
      this.components.map(async (c) => ({ ...c, result: await c.evaluator.grade(input) })),
    );

    let score = 0;
    const subScores: Record<string, number> = {};
    let judgeCostTotal = 0;
    for (const { evaluator, weight, result } of results) {
      score += (result.score * weight) / this.totalWeight;
      subScores[evaluator.kind] = result.score;
      if (result.judgeCost) judgeCostTotal += result.judgeCost.total;
    }

    return {
      score,
      passed: score >= 0.5,
      subScores,
      rationale: results
        .map(({ evaluator, result }) => `${evaluator.kind}:${result.score.toFixed(2)}`)
        .join(" "),
      ...(judgeCostTotal > 0
        ? { judgeCost: { input: 0, output: 0, total: judgeCostTotal, currency: "USD" as const } }
        : {}),
    };
  }
}
