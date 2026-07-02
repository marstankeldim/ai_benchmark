import type { BenchmarkId, Metadata, RunId, Timestamp } from "./common.js";
import type { GenerateRequest, ModelConfig, TokenUsage, Cost } from "./provider.js";
import type { GradeResult, EvaluatorSpec } from "./evaluator.js";
import type { ParsedOutput, BenchmarkCategory } from "./benchmark.js";
import type { Interval, MetricName, SignificanceTest } from "./metrics.js";

export type RunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "partial";

/** Everything needed to launch an evaluation. This is the reproducible input. */
export interface RunConfig {
  /** Benchmark ids to run (resolved from the registry). */
  benchmarks: BenchmarkId[];
  /** Models to evaluate side-by-side. */
  models: ModelConfig[];
  /** Cap tasks per benchmark. */
  limit?: number;
  /** Repeat each task N times (for pass@k and variance estimates). Default 1. */
  repeat?: number;
  /** Max concurrent model calls. `1` = sequential. Default 8. */
  concurrency?: number;
  /** Run-level retry attempts on transient errors. Default 3. */
  retries?: number;
  /** Per-call timeout in ms. */
  timeoutMs?: number;
  /** Master seed threaded into sampling, shuffling, and grading. */
  seed?: number;
  /** Enable the response cache. Default true. */
  cache?: boolean;
  /** Dataset split to load. */
  split?: string;
  /** Override a benchmark's evaluator (e.g. force an LLM judge). */
  evaluatorOverride?: Record<BenchmarkId, EvaluatorSpec>;
  /** Free-form labels for the run (experiment name, tags…). */
  metadata?: Metadata;
}

/** A single graded observation — the atomic unit stored in the database. */
export interface TaskResult {
  id: string;
  runId: RunId;
  benchmarkId: BenchmarkId;
  taskId: string;
  /** Which model produced this, and how it was sampled. */
  model: ModelConfig;
  /** Repeat index in [0, repeat). */
  repeatIndex: number;
  promptVersion: string;
  /** Snapshot of the exact request sent (for replay). */
  request: GenerateRequest;
  /** Normalized model output. */
  output: ParsedOutput;
  grade: GradeResult;
  usage: TokenUsage;
  cost?: Cost;
  latencyMs: number;
  /** Attempt count (>1 means transient failures were retried). */
  attempts: number;
  cached: boolean;
  error?: { code: string; message: string };
  createdAt: Timestamp;
}

/**
 * Per-metric aggregate. A benchmark reports only the metrics it computes, so this
 * is a partial map — readers should treat a missing metric as "not measured".
 */
export type MetricAggregate = Partial<Record<MetricName, number>>;

export interface ModelBenchmarkSummary {
  benchmarkId: BenchmarkId;
  category: BenchmarkCategory;
  n: number;
  metrics: MetricAggregate;
  intervals: Partial<Record<MetricName, Interval>>;
  meanLatencyMs: number;
  totalCostUsd: number;
}

export interface ModelSummary {
  model: ModelConfig;
  /** Weighted overall score in [0, 1] across benchmarks. */
  overall: number;
  overallInterval?: Interval;
  byBenchmark: ModelBenchmarkSummary[];
  byCategory: Record<string, number>;
  totalCostUsd: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  totalTokens: number;
  /** Auto-derived narrative for reports. */
  strengths: string[];
  weaknesses: string[];
}

/** A model-vs-model comparison on one metric/benchmark. */
export interface PairwiseComparison {
  modelA: string;
  modelB: string;
  benchmarkId?: BenchmarkId;
  metric: MetricName;
  test: SignificanceTest;
}

export interface RunEnvironment {
  evalforgeVersion: string;
  nodeVersion: string;
  platform: string;
  gitCommit?: string;
  timestamp: Timestamp;
}

/** The complete, self-describing result of a run. */
export interface RunSummary {
  runId: RunId;
  status: RunStatus;
  config: RunConfig;
  environment: RunEnvironment;
  createdAt: Timestamp;
  finishedAt?: Timestamp;
  byModel: ModelSummary[];
  comparisons: PairwiseComparison[];
  /** Counts for quick health checks. */
  stats: { totalTasks: number; completed: number; failed: number };
}

/** The lightweight record created when a run starts (before results exist). */
export interface RunRecord {
  runId: RunId;
  status: RunStatus;
  config: RunConfig;
  environment: RunEnvironment;
  createdAt: Timestamp;
}

// ── Progress streaming ────────────────────────────────────────────────────────

export type ProgressEvent =
  | { type: "run:start"; runId: RunId; totalTasks: number }
  | { type: "task:done"; runId: RunId; completed: number; total: number; result: TaskResult }
  | { type: "task:error"; runId: RunId; taskId: string; message: string }
  | { type: "run:complete"; runId: RunId; summary: RunSummary };

export type ProgressListener = (event: ProgressEvent) => void;
