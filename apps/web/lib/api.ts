/**
 * Typed client for the EvalForge REST API. The dashboard is a pure consumer of
 * the API — no direct database access — so these types mirror the API's JSON
 * responses (a UI-focused subset of `@evalforge/shared`).
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Interval {
  low: number;
  high: number;
  level: number;
}

export interface ModelConfig {
  provider: string;
  model: string;
  label?: string;
}

export interface ModelBenchmarkSummary {
  benchmarkId: string;
  category: string;
  n: number;
  metrics: Record<string, number>;
  intervals: Record<string, Interval | undefined>;
  meanLatencyMs: number;
  totalCostUsd: number;
}

export interface ModelSummary {
  model: ModelConfig;
  overall: number;
  overallInterval?: Interval;
  byBenchmark: ModelBenchmarkSummary[];
  byCategory: Record<string, number>;
  totalCostUsd: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  totalTokens: number;
  strengths: string[];
  weaknesses: string[];
}

export interface SignificanceTest {
  delta: number;
  pValue: number;
  effectSize: number;
  significant: boolean;
  method: string;
}

export interface PairwiseComparison {
  modelA: string;
  modelB: string;
  benchmarkId?: string;
  metric: string;
  test: SignificanceTest;
}

export interface RunSummary {
  runId: string;
  status: string;
  createdAt: string;
  finishedAt?: string;
  config: { benchmarks: string[]; models: ModelConfig[]; seed?: number };
  environment: { evalforgeVersion: string; nodeVersion: string; platform: string; gitCommit?: string };
  byModel: ModelSummary[];
  comparisons: PairwiseComparison[];
  stats: { totalTasks: number; completed: number; failed: number };
}

export interface RunListItem {
  runId: string;
  status: string;
  createdAt: string;
  config: { benchmarks: string[]; models: ModelConfig[] };
  hasSummary: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  model: string;
  provider: string;
  score: number;
  metric: string;
  runs: number;
  samples: number;
  meanLatencyMs?: number;
  totalCostUsd?: number;
}

export interface BenchmarkInfo {
  id: string;
  name: string;
  category: string;
  version: string;
  description?: string;
  metrics: string[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  leaderboard: (dimension = "overall") =>
    get<{ leaderboard: LeaderboardEntry[] }>(`/leaderboard?dimension=${encodeURIComponent(dimension)}`).then(
      (r) => r.leaderboard,
    ),
  runs: () => get<{ runs: RunListItem[] }>("/runs").then((r) => r.runs),
  run: (id: string) => get<{ run: { summary?: RunSummary } }>(`/runs/${id}`).then((r) => r.run.summary ?? null),
  benchmarks: () => get<{ benchmarks: BenchmarkInfo[] }>("/benchmarks").then((r) => r.benchmarks),
  health: () => get<{ status: string; version: string }>("/health"),
};

export const LEADERBOARD_DIMENSIONS = ["overall", "coding", "math", "reasoning", "knowledge", "latency", "cost"] as const;
export type Dimension = (typeof LEADERBOARD_DIMENSIONS)[number];

export const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;
export const modelName = (m: ModelConfig): string => m.label ?? `${m.provider}:${m.model}`;
