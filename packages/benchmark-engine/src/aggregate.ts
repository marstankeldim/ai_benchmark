/**
 * Aggregation: raw {@link TaskResult}s → a self-describing {@link RunSummary}.
 *
 * This is where EvalForge earns its "statistical honesty" claim. Every headline
 * number ships with a confidence interval (Wilson for binary outcomes, bootstrap
 * otherwise), and every model-vs-model gap is run through a paired significance
 * test on per-task scores — never a naive delta. Strengths and weaknesses are
 * derived from the same numbers so reports can't drift from the data.
 */

import { createRng } from "@evalforge/shared";
import type {
  Benchmark,
  BenchmarkCategory,
  Interval,
  MetricAggregate,
  MetricName,
  ModelBenchmarkSummary,
  ModelConfig,
  ModelSummary,
  PairwiseComparison,
  RunConfig,
  RunEnvironment,
  RunId,
  RunStatus,
  RunSummary,
  TaskResult,
} from "@evalforge/shared";
import {
  accuracy,
  bootstrapCi,
  compareScores,
  passAtKCorpus,
  passRate,
  quantile,
  tokenEfficiency,
  wilsonInterval,
} from "@evalforge/scoring";

const LATENCY_COST_METRICS = new Set<MetricName>([
  "meanLatencyMs",
  "p95LatencyMs",
  "totalCostUsd",
  "costPerCorrect",
  "tokenEfficiency",
]);

const modelLabel = (m: ModelConfig): string => m.label ?? `${m.provider}:${m.model}`;
const meanOf = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Per-task rollup: average score across repeats, plus the pass tally for pass@k. */
interface TaskRollup {
  scores: number[];
  passed: number;
  n: number;
}

function rollupByTask(results: TaskResult[]): Map<string, TaskRollup> {
  const byTask = new Map<string, TaskRollup>();
  for (const r of results) {
    let t = byTask.get(r.taskId);
    if (!t) {
      t = { scores: [], passed: 0, n: 0 };
      byTask.set(r.taskId, t);
    }
    t.scores.push(r.grade.score);
    t.n++;
    if (r.grade.passed) t.passed++;
  }
  return byTask;
}

/** Compute every standard metric for one (model, benchmark) cell. */
export function computeBenchmarkMetrics(
  results: TaskResult[],
  benchmark: Benchmark,
  repeat: number,
  rng: ReturnType<typeof createRng>,
): ModelBenchmarkSummary {
  const scores = results.map((r) => r.grade.score);
  const latencies = results.map((r) => r.latencyMs);
  const costs = results.map((r) => r.cost?.total ?? 0);
  const byTask = rollupByTask(results);
  const tallies = [...byTask.values()].map((t) => ({ n: t.n, c: t.passed }));
  const perTaskScore = [...byTask.values()].map((t) => meanOf(t.scores));
  const passedCount = results.filter((r) => r.grade.passed).length;
  const totalCost = costs.reduce((s, x) => s + x, 0);

  const metrics: MetricAggregate = {
    accuracy: accuracy(scores),
    passRate: passRate(results.map((r) => r.grade.passed)),
    "pass@1": passAtKCorpus(tallies, 1),
    meanLatencyMs: meanOf(latencies),
    p95LatencyMs: latencies.length ? quantile(latencies, 0.95) : 0,
    totalCostUsd: totalCost,
    tokenEfficiency: meanOf(
      results.map((r) => tokenEfficiency(r.grade.passed, r.usage.completionTokens)),
    ),
    costPerCorrect: passedCount > 0 ? totalCost / passedCount : 0,
  };
  if (repeat > 1) metrics["pass@k"] = passAtKCorpus(tallies, repeat);

  // Any quality metric the benchmark declares but we didn't compute is score-based.
  for (const m of benchmark.metrics) {
    if (!(m in metrics) && !LATENCY_COST_METRICS.has(m)) metrics[m] = accuracy(scores);
  }

  const headlineMetric = headlineOf(benchmark);
  const intervals: Partial<Record<MetricName, Interval>> = {};
  intervals[headlineMetric] = intervalFor(perTaskScore, rng);

  return {
    benchmarkId: benchmark.id,
    category: benchmark.category,
    n: results.length,
    metrics,
    intervals,
    meanLatencyMs: metrics.meanLatencyMs ?? 0,
    totalCostUsd: totalCost,
  };
}

/** The benchmark's headline metric — first declared quality metric, else accuracy. */
export function headlineOf(benchmark: Benchmark): MetricName {
  return benchmark.metrics.find((m) => !LATENCY_COST_METRICS.has(m)) ?? "accuracy";
}

/** Wilson interval for binary per-task outcomes; bootstrap otherwise. */
function intervalFor(perTaskScore: number[], rng: ReturnType<typeof createRng>): Interval {
  if (perTaskScore.length === 0) return { low: 0, high: 0, level: 0.95, method: "wilson" };
  const binary = perTaskScore.every((s) => s === 0 || s === 1);
  if (binary) {
    const passed = perTaskScore.filter((s) => s === 1).length;
    return wilsonInterval(passed, perTaskScore.length, 0.95);
  }
  return bootstrapCi(perTaskScore, { rng, iterations: 1000, level: 0.95 });
}

/** Assemble one model's full summary across all benchmarks it ran. */
export function summarizeModel(
  model: ModelConfig,
  results: TaskResult[],
  benchmarks: Map<string, Benchmark>,
  repeat: number,
  rng: ReturnType<typeof createRng>,
): ModelSummary {
  const byBenchmarkId = groupBy(results, (r) => r.benchmarkId);
  const byBenchmark: ModelBenchmarkSummary[] = [];
  for (const [benchmarkId, rows] of byBenchmarkId) {
    const benchmark = benchmarks.get(benchmarkId);
    if (!benchmark) continue;
    byBenchmark.push(computeBenchmarkMetrics(rows, benchmark, repeat, rng));
  }

  const headlineByBenchmark = byBenchmark.map((b) => {
    const bench = benchmarks.get(b.benchmarkId)!;
    return { benchmarkId: b.benchmarkId, category: b.category, value: b.metrics[headlineOf(bench)] ?? 0 };
  });

  const overall = meanOf(headlineByBenchmark.map((h) => h.value));
  const byCategory = averageByCategory(headlineByBenchmark);

  const allLatencies = results.map((r) => r.latencyMs);
  const { strengths, weaknesses } = narrate(headlineByBenchmark, overall);

  return {
    model,
    overall,
    ...(byBenchmark.length > 1
      ? { overallInterval: bootstrapCi(headlineByBenchmark.map((h) => h.value), { rng, iterations: 1000 }) }
      : byBenchmark[0]?.intervals[headlineOf(benchmarks.get(byBenchmark[0].benchmarkId)!)]
        ? { overallInterval: byBenchmark[0]!.intervals[headlineOf(benchmarks.get(byBenchmark[0]!.benchmarkId)!)]! }
        : {}),
    byBenchmark,
    byCategory,
    totalCostUsd: results.reduce((s, r) => s + (r.cost?.total ?? 0), 0),
    meanLatencyMs: meanOf(allLatencies),
    p95LatencyMs: allLatencies.length ? quantile(allLatencies, 0.95) : 0,
    totalTokens: results.reduce((s, r) => s + r.usage.totalTokens, 0),
    strengths,
    weaknesses,
  };
}

function averageByCategory(
  headlines: Array<{ category: BenchmarkCategory; value: number }>,
): Record<string, number> {
  const groups = groupBy(headlines, (h) => h.category);
  const out: Record<string, number> = {};
  for (const [category, rows] of groups) out[category] = meanOf(rows.map((r) => r.value));
  return out;
}

/** Derive strengths/weaknesses relative to the model's own average. */
function narrate(
  headlines: Array<{ benchmarkId: string; value: number }>,
  overall: number,
): { strengths: string[]; weaknesses: string[] } {
  const sorted = [...headlines].sort((a, b) => b.value - a.value);
  const strengths = sorted
    .filter((h) => h.value >= Math.max(overall + 0.05, 0.7))
    .slice(0, 3)
    .map((h) => `${h.benchmarkId} (${(h.value * 100).toFixed(1)}%)`);
  const weaknesses = [...sorted]
    .reverse()
    .filter((h) => h.value <= Math.min(overall - 0.05, 0.6))
    .slice(0, 3)
    .map((h) => `${h.benchmarkId} (${(h.value * 100).toFixed(1)}%)`);
  return { strengths, weaknesses };
}

/**
 * Pairwise significance tests between every pair of models: one per shared
 * benchmark (headline metric) plus an overall comparison across all shared tasks.
 */
export function compareModels(
  models: ModelConfig[],
  results: TaskResult[],
  benchmarks: Map<string, Benchmark>,
  rng: ReturnType<typeof createRng>,
): PairwiseComparison[] {
  const comparisons: PairwiseComparison[] = [];
  const byModel = groupBy(results, (r) => modelLabel(r.model));

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i]!;
      const b = models[j]!;
      const aResults = byModel.get(modelLabel(a)) ?? [];
      const bResults = byModel.get(modelLabel(b)) ?? [];

      const benchmarkIds = new Set([...aResults, ...bResults].map((r) => r.benchmarkId));
      for (const benchmarkId of benchmarkIds) {
        const bench = benchmarks.get(benchmarkId);
        const aligned = alignByTask(
          aResults.filter((r) => r.benchmarkId === benchmarkId),
          bResults.filter((r) => r.benchmarkId === benchmarkId),
        );
        if (aligned.a.length < 2) continue;
        comparisons.push({
          modelA: modelLabel(a),
          modelB: modelLabel(b),
          benchmarkId,
          metric: bench ? headlineOf(bench) : "accuracy",
          test: compareScores(aligned.a, aligned.b, { method: "paired-bootstrap", rng }),
        });
      }

      // Overall across all shared tasks.
      const allAligned = alignByTask(aResults, bResults);
      if (allAligned.a.length >= 2) {
        comparisons.push({
          modelA: modelLabel(a),
          modelB: modelLabel(b),
          metric: "accuracy",
          test: compareScores(allAligned.a, allAligned.b, { method: "paired-bootstrap", rng }),
        });
      }
    }
  }
  return comparisons;
}

/** Align two models' per-task mean scores on the intersection of task ids. */
function alignByTask(aResults: TaskResult[], bResults: TaskResult[]): { a: number[]; b: number[] } {
  const aByTask = rollupByTask(aResults);
  const bByTask = rollupByTask(bResults);
  const a: number[] = [];
  const b: number[] = [];
  for (const [taskId, ta] of aByTask) {
    const tb = bByTask.get(taskId);
    if (!tb) continue;
    a.push(meanOf(ta.scores));
    b.push(meanOf(tb.scores));
  }
  return { a, b };
}

export interface BuildSummaryInput {
  runId: RunId;
  status: RunStatus;
  config: RunConfig;
  environment: RunEnvironment;
  createdAt: string;
  finishedAt?: string;
  results: TaskResult[];
  benchmarks: Benchmark[];
  totalTasks: number;
}

/** Build the complete run summary from all results. */
export function buildRunSummary(input: BuildSummaryInput): RunSummary {
  const rng = createRng(input.config.seed ?? 12345);
  const benchmarkMap = new Map(input.benchmarks.map((b) => [b.id, b]));
  const repeat = Math.max(1, input.config.repeat ?? 1);
  const byModel = groupBy(input.results, (r) => modelLabel(r.model));

  const summaries: ModelSummary[] = input.config.models.map((model) =>
    summarizeModel(model, byModel.get(modelLabel(model)) ?? [], benchmarkMap, repeat, rng),
  );

  const failed = input.results.filter((r) => r.error).length;
  return {
    runId: input.runId,
    status: input.status,
    config: input.config,
    environment: input.environment,
    createdAt: input.createdAt,
    ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
    byModel: summaries,
    comparisons: compareModels(input.config.models, input.results, benchmarkMap, rng),
    stats: {
      totalTasks: input.totalTasks,
      completed: input.results.length - failed,
      failed,
    },
  };
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}
