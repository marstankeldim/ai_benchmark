/**
 * CSV renderer — a tidy long-format table (one row per model × benchmark × metric)
 * that drops straight into a spreadsheet or pandas. RFC-4180 quoting.
 */

import type { RunSummary } from "@evalforge/shared";
import { flattenMetrics } from "./json.js";

const COLUMNS = ["model", "provider", "benchmarkId", "category", "metric", "value", "ciLow", "ciHigh", "n"] as const;

/** Quote a CSV cell if it contains a comma, quote, or newline. */
function cell(value: string | number | undefined): string {
  if (value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderCsv(summary: RunSummary): string {
  const rows = flattenMetrics(summary);
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => cell((r as unknown as Record<string, string | number | undefined>)[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
