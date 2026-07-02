import { describe, expect, it } from "vitest";
import type { ModelSummary, RunSummary } from "@evalforge/shared";
import { renderReport } from "./render.js";
import { flattenMetrics } from "./renderers/json.js";
import { recommendations, headline } from "./narrative.js";
import { radarChart } from "./charts/radar.js";
import { barChart } from "./charts/bars.js";

const model = (label: string, overall: number, cost: number, latency: number): ModelSummary => ({
  model: { provider: "mock", model: label, label },
  overall,
  overallInterval: { low: overall - 0.05, high: overall + 0.05, level: 0.95, method: "wilson" },
  byBenchmark: [
    {
      benchmarkId: "gsm8k",
      category: "math",
      n: 8,
      metrics: { accuracy: overall, meanLatencyMs: latency, totalCostUsd: cost },
      intervals: { accuracy: { low: overall - 0.05, high: overall + 0.05, level: 0.95, method: "wilson" } },
      meanLatencyMs: latency,
      totalCostUsd: cost,
    },
    {
      benchmarkId: "mmlu",
      category: "knowledge",
      n: 10,
      metrics: { accuracy: overall - 0.05, meanLatencyMs: latency, totalCostUsd: cost },
      intervals: {},
      meanLatencyMs: latency,
      totalCostUsd: cost,
    },
  ],
  byCategory: { math: overall, knowledge: overall - 0.05, reasoning: overall + 0.02 },
  totalCostUsd: cost,
  meanLatencyMs: latency,
  p95LatencyMs: latency * 1.5,
  totalTokens: 5000,
  strengths: ["gsm8k (85.0%)"],
  weaknesses: [],
});

const summary: RunSummary = {
  runId: "run_test_123",
  status: "completed",
  config: { benchmarks: ["gsm8k", "mmlu"], models: [] },
  environment: { evalforgeVersion: "0.1.0", nodeVersion: "v22", platform: "test", timestamp: "2026-07-01T00:00:00Z" },
  createdAt: "2026-07-01T00:00:00Z",
  finishedAt: "2026-07-01T00:01:00Z",
  byModel: [model("strong", 0.85, 0.02, 120), model("weak", 0.55, 0.005, 40)],
  comparisons: [
    {
      modelA: "strong",
      modelB: "weak",
      metric: "accuracy",
      test: { delta: 0.3, pValue: 0.002, effectSize: 0.7, significant: true, method: "paired-bootstrap" },
    },
  ],
  stats: { totalTasks: 36, completed: 36, failed: 0 },
};

describe("narrative", () => {
  it("names the leader in the headline", () => {
    expect(headline(summary)).toContain("strong");
    expect(headline(summary)).toContain("85.0%");
  });
  it("recommends best/value/fastest/cheapest and flags significance", () => {
    const recs = recommendations(summary).join("\n");
    expect(recs).toMatch(/Highest accuracy.*strong/);
    expect(recs).toMatch(/Lowest latency.*weak/);
    expect(recs).toMatch(/Lowest cost.*weak/);
    expect(recs).toMatch(/Significant gap/);
  });
});

describe("charts", () => {
  it("radar renders a valid SVG with a polygon per model", () => {
    const svgStr = radarChart(["math", "knowledge", "reasoning"], [
      { label: "a", values: [0.8, 0.7, 0.9] },
      { label: "b", values: [0.5, 0.6, 0.4] },
    ]);
    expect(svgStr.startsWith("<svg")).toBe(true);
    expect((svgStr.match(/<polygon/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("bar chart draws error bars when an interval is present", () => {
    const svgStr = barChart([{ label: "x", value: 0.8, interval: { low: 0.7, high: 0.9 } }], { unit: "fraction" });
    expect(svgStr).toContain("<rect");
    expect(svgStr).toContain("<line");
  });
});

describe("renderers", () => {
  it("markdown includes tables, comparisons, and recommendations", () => {
    const md = renderReport(summary, "markdown");
    expect(md).toContain("# EvalForge Report");
    expect(md).toContain("## Overall");
    expect(md).toContain("| strong |");
    expect(md).toContain("Statistical comparisons");
    expect(md).toContain("Recommendations");
  });

  it("html is a self-contained document with inline SVG", () => {
    const html = renderReport(summary, "html");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<svg");
    expect(html).toContain("EvalForge Report");
  });

  it("json flattens metrics into tidy rows", () => {
    const rows = flattenMetrics(summary);
    expect(rows.length).toBeGreaterThan(0);
    const gsmAcc = rows.find((r) => r.model === "strong" && r.benchmarkId === "gsm8k" && r.metric === "accuracy");
    expect(gsmAcc?.value).toBeCloseTo(0.85, 6);
    expect(gsmAcc?.ciLow).toBeDefined();
    expect(JSON.parse(renderReport(summary, "json")).metrics.length).toBe(rows.length);
  });

  it("csv is header + one row per metric with RFC-4180 quoting", () => {
    const csv = renderReport(summary, "csv");
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("model,provider,benchmarkId,category,metric,value,ciLow,ciHigh,n");
    expect(lines.length).toBe(flattenMetrics(summary).length + 1);
  });
});
