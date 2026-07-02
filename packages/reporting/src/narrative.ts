/**
 * Turn a {@link RunSummary} into human-readable narrative: a headline, and a set
 * of recommendations grounded in the same numbers the charts use (best overall,
 * best value, fastest, cheapest, and any statistically-significant gaps). Nothing
 * here invents facts — it ranks and phrases what aggregation already computed.
 */

import type { ModelSummary, RunSummary } from "@evalforge/shared";
import { pct, usd, ms } from "./format.js";

const labelOf = (m: ModelSummary): string => m.model.label ?? `${m.model.provider}:${m.model.model}`;

/** A one-line headline naming the top model and its score. */
export function headline(summary: RunSummary): string {
  const ranked = [...summary.byModel].sort((a, b) => b.overall - a.overall);
  const best = ranked[0];
  if (!best) return "No models evaluated.";
  return `${labelOf(best)} leads with an overall score of ${pct(best.overall)} across ${summary.config.benchmarks.length} benchmark(s).`;
}

/** Actionable recommendations derived from the summary. */
export function recommendations(summary: RunSummary): string[] {
  const models = summary.byModel;
  if (models.length === 0) return [];
  const recs: string[] = [];

  const byOverall = [...models].sort((a, b) => b.overall - a.overall);
  const best = byOverall[0]!;
  recs.push(`**Highest accuracy:** ${labelOf(best)} (${pct(best.overall)} overall). Choose it when quality matters most.`);

  const priced = models.filter((m) => m.totalCostUsd > 0);
  if (priced.length > 0) {
    const byValue = [...priced].sort((a, b) => b.overall / b.totalCostUsd - a.overall / a.totalCostUsd);
    const value = byValue[0]!;
    if (labelOf(value) !== labelOf(best)) {
      recs.push(
        `**Best value:** ${labelOf(value)} delivers the most accuracy per dollar ` +
          `(${pct(value.overall)} at ${usd(value.totalCostUsd)}).`,
      );
    }
  }

  const byLatency = [...models].sort((a, b) => a.meanLatencyMs - b.meanLatencyMs);
  const fastest = byLatency[0]!;
  recs.push(`**Lowest latency:** ${labelOf(fastest)} (${ms(fastest.meanLatencyMs)} mean, ${ms(fastest.p95LatencyMs)} p95).`);

  const cheapest = [...models].sort((a, b) => a.totalCostUsd - b.totalCostUsd)[0]!;
  recs.push(`**Lowest cost:** ${labelOf(cheapest)} (${usd(cheapest.totalCostUsd)} for this run).`);

  const sig = summary.comparisons.filter((c) => c.benchmarkId === undefined && c.test.significant);
  for (const c of sig) {
    const winner = c.test.delta >= 0 ? c.modelA : c.modelB;
    const loser = c.test.delta >= 0 ? c.modelB : c.modelA;
    recs.push(
      `**Significant gap:** ${winner} beats ${loser} overall by ${pct(Math.abs(c.test.delta))} ` +
        `(p=${c.test.pValue.toFixed(3)}, effect size ${c.test.effectSize.toFixed(2)}).`,
    );
  }

  if (best.overall < 0.6) {
    recs.push(`**Caution:** even the top model scores below 60% — consider prompt tuning or a harder-model tier.`);
  }
  return recs;
}
