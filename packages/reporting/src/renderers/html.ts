/**
 * HTML renderer — a single, self-contained, print-ready document (the PDF path is
 * "print this to PDF"). Embeds inline SVG radar and bar charts, styled tables, and
 * the narrative. No external CSS/JS, so it renders identically offline and in
 * email.
 */

import type { RunSummary } from "@evalforge/shared";
import { barChart, type Bar } from "../charts/bars.js";
import { radarChart, type RadarSeries } from "../charts/radar.js";
import { headlineOfMetric, metricLabel } from "../metric-labels.js";
import { esc } from "../charts/svg.js";
import { int, ms, pct, usd, withInterval } from "../format.js";
import { headline, recommendations } from "../narrative.js";

const label = (m: RunSummary["byModel"][number]): string =>
  m.model.label ?? `${m.model.provider}:${m.model.model}`;

export function renderHtml(summary: RunSummary): string {
  const ranked = [...summary.byModel].sort((a, b) => b.overall - a.overall);
  const categories = [...new Set(ranked.flatMap((m) => Object.keys(m.byCategory)))].sort();

  const radar: RadarSeries[] = ranked.map((m) => ({
    label: label(m),
    values: categories.map((c) => m.byCategory[c] ?? 0),
  }));
  const overallBars: Bar[] = ranked.map((m, i) => ({
    label: label(m),
    value: m.overall,
    ...(m.overallInterval ? { interval: { low: m.overallInterval.low, high: m.overallInterval.high } } : {}),
    colorIndex: i,
  }));
  const latencyBars: Bar[] = ranked.map((m, i) => ({ label: label(m), value: m.meanLatencyMs, colorIndex: i }));
  const costBars: Bar[] = ranked.map((m, i) => ({ label: label(m), value: m.totalCostUsd, colorIndex: i }));

  const body: string[] = [];
  body.push(`<h1>EvalForge Report</h1>`);
  body.push(`<p class="lede">${esc(headline(summary))}</p>`);
  body.push(
    `<p class="meta">Run <code>${esc(summary.runId)}</code> · ${esc(summary.status)} · ${esc(summary.createdAt)} · ` +
      `EvalForge ${esc(summary.environment.evalforgeVersion)} · Node ${esc(summary.environment.nodeVersion)}</p>`,
  );

  body.push(`<div class="grid">`);
  body.push(`<div class="card"><h3>Overall score</h3>${barChart(overallBars, { unit: "fraction", format: pct })}</div>`);
  if (categories.length >= 3) {
    body.push(`<div class="card"><h3>Category profile</h3>${radarChart(categories, radar)}</div>`);
  }
  body.push(`<div class="card"><h3>Mean latency</h3>${barChart(latencyBars, { format: ms })}</div>`);
  body.push(`<div class="card"><h3>Total cost</h3>${barChart(costBars, { format: usd })}</div>`);
  body.push(`</div>`);

  // Leaderboard table.
  body.push(`<h2>Leaderboard</h2>`);
  body.push(table(
    ["Rank", "Model", "Overall", "Latency", "p95", "Cost", "Tokens"],
    ranked.map((m, i) => [
      String(i + 1),
      label(m),
      withInterval(m.overall, m.overallInterval, pct),
      ms(m.meanLatencyMs),
      ms(m.p95LatencyMs),
      usd(m.totalCostUsd),
      int(m.totalTokens),
    ]),
  ));

  // Per-model benchmark tables.
  for (const m of ranked) {
    body.push(`<h2>${esc(label(m))}</h2>`);
    body.push(table(
      ["Benchmark", "Category", "n", "Score", "Latency", "Cost"],
      m.byBenchmark.map((b) => {
        const metric = headlineOfMetric(Object.keys(b.metrics));
        return [
          b.benchmarkId,
          b.category,
          String(b.n),
          withInterval(b.metrics[metric] ?? 0, b.intervals[metric], pct),
          ms(b.meanLatencyMs),
          usd(b.totalCostUsd),
        ];
      }),
    ));
    if (m.strengths.length) body.push(`<p><strong>Strengths:</strong> ${esc(m.strengths.join(", "))}</p>`);
    if (m.weaknesses.length) body.push(`<p><strong>Weaknesses:</strong> ${esc(m.weaknesses.join(", "))}</p>`);
  }

  // Comparisons.
  const cmp = summary.comparisons.filter((c) => c.benchmarkId === undefined);
  if (cmp.length > 0) {
    body.push(`<h2>Statistical comparisons</h2>`);
    body.push(table(
      ["A", "B", "Δ", "Metric", "p-value", "Effect size", "Significant"],
      cmp.map((c) => [
        c.modelA,
        c.modelB,
        pct(c.test.delta),
        metricLabel(c.metric),
        c.test.pValue.toFixed(3),
        c.test.effectSize.toFixed(2),
        c.test.significant ? "yes" : "—",
      ]),
    ));
  }

  // Recommendations.
  body.push(`<h2>Recommendations</h2><ul>`);
  for (const r of recommendations(summary)) body.push(`<li>${mdInline(r)}</li>`);
  body.push(`</ul>`);

  return document(`EvalForge Report — ${summary.runId}`, body.join("\n"));
}

function table(headers: string[], rows: string[][]): string {
  const thead = `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/** Minimal **bold** support for recommendation strings. */
function mdInline(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function document(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; max-width: 1000px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.5; }
  h1 { font-size: 1.8rem; margin-bottom: .25rem; }
  h2 { margin-top: 2rem; border-bottom: 1px solid #e2e8f0; padding-bottom: .3rem; }
  h3 { margin: 0 0 .5rem; font-size: .95rem; color: #475569; }
  .lede { font-size: 1.05rem; color: #1e293b; }
  .meta { color: #64748b; font-size: .85rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem; background: #fff; }
  table { border-collapse: collapse; width: 100%; font-size: .88rem; margin: .5rem 0 1rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #eef2f7; }
  th { background: #f8fafc; font-weight: 600; }
  td:not(:nth-child(2)), th:not(:nth-child(2)) { text-align: right; }
  td:nth-child(2), th:nth-child(2) { text-align: left; }
  code { background: #f1f5f9; padding: .1rem .3rem; border-radius: 4px; font-size: .85em; }
  @media print { .card { break-inside: avoid; } body { margin: 0; } }
</style></head>
<body>${body}
<footer class="meta" style="margin-top:2rem;border-top:1px solid #e2e8f0;padding-top:.75rem">Generated by EvalForge.</footer>
</body></html>`;
}
