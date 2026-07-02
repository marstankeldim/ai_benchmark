/**
 * JSON renderer. Emits the full, machine-readable summary plus a flattened
 * `metrics` array (long/tidy format) that's trivial to load into a notebook or a
 * spreadsheet without walking the nested structure.
 */

import type { RunSummary } from "@evalforge/shared";
import { headlineOfMetric } from "../metric-labels.js";

export interface FlatMetricRow {
  model: string;
  provider: string;
  benchmarkId: string;
  category: string;
  metric: string;
  value: number;
  ciLow?: number;
  ciHigh?: number;
  n: number;
}

/** Flatten every (model × benchmark × metric) cell into tidy rows. */
export function flattenMetrics(summary: RunSummary): FlatMetricRow[] {
  const rows: FlatMetricRow[] = [];
  for (const m of summary.byModel) {
    const label = m.model.label ?? `${m.model.provider}:${m.model.model}`;
    for (const b of m.byBenchmark) {
      for (const [metric, value] of Object.entries(b.metrics)) {
        if (value === undefined) continue;
        const iv = b.intervals[metric];
        rows.push({
          model: label,
          provider: m.model.provider,
          benchmarkId: b.benchmarkId,
          category: b.category,
          metric,
          value,
          ...(iv ? { ciLow: iv.low, ciHigh: iv.high } : {}),
          n: b.n,
        });
      }
    }
  }
  return rows;
}

export function renderJson(summary: RunSummary, pretty = true): string {
  const payload = {
    summary,
    headlineMetricByBenchmark: Object.fromEntries(
      summary.byModel.flatMap((m) =>
        m.byBenchmark.map((b) => [b.benchmarkId, headlineOfMetric(Object.keys(b.metrics))] as const),
      ),
    ),
    metrics: flattenMetrics(summary),
  };
  return JSON.stringify(payload, null, pretty ? 2 : 0);
}
