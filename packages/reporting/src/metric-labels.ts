/**
 * Metric presentation metadata: which metrics are "headline" quality scores vs.
 * cost/latency telemetry, plus human-friendly labels. Kept in the reporting layer
 * so renderers agree on terminology.
 */

import type { MetricName } from "@evalforge/shared";

/** Metrics that describe cost/speed rather than answer quality. */
export const TELEMETRY_METRICS = new Set<string>([
  "meanLatencyMs",
  "p95LatencyMs",
  "totalCostUsd",
  "costPerCorrect",
  "tokenEfficiency",
]);

const LABELS: Record<string, string> = {
  accuracy: "Accuracy",
  exactMatch: "Exact match",
  f1: "F1",
  "pass@1": "pass@1",
  "pass@k": "pass@k",
  passRate: "Pass rate",
  compilationSuccess: "Compilation",
  semanticSimilarity: "Semantic sim.",
  hallucinationRate: "Hallucination",
  toolCallAccuracy: "Tool accuracy",
  jsonValidity: "JSON validity",
  retrievalAccuracy: "Retrieval",
  reasoningQuality: "Reasoning",
  tokenEfficiency: "Token eff.",
  meanLatencyMs: "Mean latency",
  p95LatencyMs: "p95 latency",
  totalCostUsd: "Total cost",
  costPerCorrect: "Cost/correct",
};

/** A display label for a metric name. */
export const metricLabel = (metric: MetricName): string => LABELS[metric] ?? metric;

/** Choose the headline (first quality) metric from a set of metric names. */
export function headlineOfMetric(metrics: string[]): string {
  return metrics.find((m) => !TELEMETRY_METRICS.has(m)) ?? "accuracy";
}
