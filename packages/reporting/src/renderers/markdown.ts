/**
 * Markdown renderer. Produces a GitHub-friendly report: summary table, per-model
 * category + benchmark breakdowns with confidence intervals, pairwise
 * significance, strengths/weaknesses, and recommendations.
 */

import type { ModelSummary, RunSummary } from "@evalforge/shared";
import { headlineOfMetric } from "../metric-labels.js";
import { int, ms, pct, usd, withInterval } from "../format.js";
import { headline, recommendations } from "../narrative.js";

const label = (m: ModelSummary): string => m.model.label ?? `${m.model.provider}:${m.model.model}`;

export function renderMarkdown(summary: RunSummary): string {
  const lines: string[] = [];
  const ranked = [...summary.byModel].sort((a, b) => b.overall - a.overall);

  lines.push(`# EvalForge Report`);
  lines.push("");
  lines.push(`> ${headline(summary)}`);
  lines.push("");
  lines.push(
    `**Run:** \`${summary.runId}\` · **Status:** ${summary.status} · **Date:** ${summary.createdAt}`,
  );
  lines.push(
    `**Environment:** EvalForge ${summary.environment.evalforgeVersion}, Node ${summary.environment.nodeVersion}, ${summary.environment.platform}` +
      (summary.environment.gitCommit ? ` · commit \`${summary.environment.gitCommit.slice(0, 8)}\`` : ""),
  );
  lines.push("");

  // Leaderboard.
  lines.push(`## Overall`);
  lines.push("");
  lines.push(`| Rank | Model | Overall | Mean latency | p95 | Cost | Tokens |`);
  lines.push(`|---:|:--|--:|--:|--:|--:|--:|`);
  ranked.forEach((m, i) => {
    lines.push(
      `| ${i + 1} | ${label(m)} | ${withInterval(m.overall, m.overallInterval, pct)} | ${ms(m.meanLatencyMs)} | ${ms(m.p95LatencyMs)} | ${usd(m.totalCostUsd)} | ${int(m.totalTokens)} |`,
    );
  });
  lines.push("");

  // Category matrix.
  const categories = [...new Set(ranked.flatMap((m) => Object.keys(m.byCategory)))].sort();
  if (categories.length > 0) {
    lines.push(`## Category scores`);
    lines.push("");
    lines.push(`| Model | ${categories.join(" | ")} |`);
    lines.push(`|:--|${categories.map(() => "--:").join("|")}|`);
    for (const m of ranked) {
      const cells = categories.map((c) => (c in m.byCategory ? pct(m.byCategory[c]!) : "—"));
      lines.push(`| ${label(m)} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  // Per-model detail.
  for (const m of ranked) {
    lines.push(`## ${label(m)}`);
    lines.push("");
    lines.push(`| Benchmark | Category | n | ${"Score"} | Latency | Cost |`);
    lines.push(`|:--|:--|--:|--:|--:|--:|`);
    for (const b of m.byBenchmark) {
      const metric = headlineMetricOf(b.metrics);
      const value = b.metrics[metric] ?? 0;
      const iv = b.intervals[metric];
      lines.push(
        `| ${b.benchmarkId} | ${b.category} | ${b.n} | ${withInterval(value, iv, pct)} | ${ms(b.meanLatencyMs)} | ${usd(b.totalCostUsd)} |`,
      );
    }
    lines.push("");
    if (m.strengths.length) lines.push(`**Strengths:** ${m.strengths.join(", ")}`);
    if (m.weaknesses.length) lines.push(`**Weaknesses:** ${m.weaknesses.join(", ")}`);
    if (m.strengths.length || m.weaknesses.length) lines.push("");
  }

  // Pairwise comparisons.
  const overallComparisons = summary.comparisons.filter((c) => c.benchmarkId === undefined);
  if (overallComparisons.length > 0) {
    lines.push(`## Statistical comparisons`);
    lines.push("");
    lines.push(`| A | B | Δ | p-value | Effect size | Significant | Method |`);
    lines.push(`|:--|:--|--:|--:|--:|:-:|:--|`);
    for (const c of overallComparisons) {
      lines.push(
        `| ${c.modelA} | ${c.modelB} | ${pct(c.test.delta)} | ${c.test.pValue.toFixed(3)} | ${c.test.effectSize.toFixed(2)} | ${c.test.significant ? "✅" : "—"} | ${c.test.method} |`,
      );
    }
    lines.push("");
  }

  // Recommendations.
  lines.push(`## Recommendations`);
  lines.push("");
  for (const r of recommendations(summary)) lines.push(`- ${r}`);
  lines.push("");
  lines.push(
    `_Tasks: ${summary.stats.completed} completed, ${summary.stats.failed} failed of ${summary.stats.totalTasks} total._`,
  );
  lines.push("");
  return lines.join("\n");
}

/** Pick the headline metric present in a metrics map (mirrors engine's choice). */
function headlineMetricOf(metrics: Record<string, number | undefined>): string {
  return headlineOfMetric(Object.keys(metrics));
}
