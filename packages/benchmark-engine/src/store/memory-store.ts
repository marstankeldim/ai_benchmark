/**
 * In-memory {@link RunStore}. This is the default persistence backend — it makes
 * the engine runnable and fully testable with zero infrastructure. The Postgres
 * implementation (`@evalforge/db`) satisfies the same interface, so swapping to a
 * durable store never touches the engine.
 */

import type {
  LeaderboardEntry,
  LeaderboardQuery,
  ResultQuery,
  RunId,
  RunQuery,
  RunRecord,
  RunStatus,
  RunStore,
  RunSummary,
  StoredRun,
  TaskResult,
  Timestamp,
} from "@evalforge/shared";
import { resultKey } from "../planner.js";

interface RunEntry {
  record: RunRecord;
  status: RunStatus;
  finishedAt?: Timestamp;
  summary?: RunSummary;
  results: Map<string, TaskResult>;
}

export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<RunId, RunEntry>();

  async createRun(run: RunRecord): Promise<void> {
    if (!this.runs.has(run.runId)) {
      this.runs.set(run.runId, { record: run, status: run.status, results: new Map() });
    }
  }

  async updateRunStatus(runId: RunId, status: RunStatus, finishedAt?: Timestamp): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry) return;
    entry.status = status;
    if (finishedAt) entry.finishedAt = finishedAt;
  }

  async saveSummary(summary: RunSummary): Promise<void> {
    const entry = this.runs.get(summary.runId);
    if (!entry) return;
    entry.summary = summary;
    entry.status = summary.status;
    if (summary.finishedAt) entry.finishedAt = summary.finishedAt;
  }

  async saveResult(result: TaskResult): Promise<void> {
    const entry = this.runs.get(result.runId);
    if (!entry) return;
    entry.results.set(
      resultKey(result.benchmarkId, result.model, result.taskId, result.repeatIndex),
      result,
    );
  }

  async saveResults(results: TaskResult[]): Promise<void> {
    for (const r of results) await this.saveResult(r);
  }

  async completedTaskKeys(runId: RunId): Promise<Set<string>> {
    return new Set(this.runs.get(runId)?.results.keys() ?? []);
  }

  async getRun(runId: RunId): Promise<StoredRun | null> {
    const entry = this.runs.get(runId);
    return entry ? this.toStoredRun(entry) : null;
  }

  async listRuns(query: RunQuery = {}): Promise<StoredRun[]> {
    let runs = [...this.runs.values()];
    if (query.status) runs = runs.filter((r) => r.status === query.status);
    if (query.benchmarkId) {
      runs = runs.filter((r) => r.record.config.benchmarks.includes(query.benchmarkId!));
    }
    if (query.provider) {
      runs = runs.filter((r) => r.record.config.models.some((m) => m.provider === query.provider));
    }
    if (query.model) {
      runs = runs.filter((r) => r.record.config.models.some((m) => m.model === query.model));
    }
    if (query.since) runs = runs.filter((r) => r.record.createdAt >= query.since!);
    if (query.until) runs = runs.filter((r) => r.record.createdAt <= query.until!);
    runs.sort((a, b) => (a.record.createdAt < b.record.createdAt ? 1 : -1));
    const offset = query.offset ?? 0;
    const limited = query.limit ? runs.slice(offset, offset + query.limit) : runs.slice(offset);
    return limited.map((r) => this.toStoredRun(r));
  }

  async getResults(query: ResultQuery): Promise<TaskResult[]> {
    let all: TaskResult[] = [];
    for (const entry of this.runs.values()) {
      if (query.runId && entry.record.runId !== query.runId) continue;
      all = all.concat([...entry.results.values()]);
    }
    if (query.benchmarkId) all = all.filter((r) => r.benchmarkId === query.benchmarkId);
    if (query.model) all = all.filter((r) => r.model.model === query.model);
    if (query.passed !== undefined) all = all.filter((r) => r.grade.passed === query.passed);
    const offset = query.offset ?? 0;
    return query.limit ? all.slice(offset, offset + query.limit) : all.slice(offset);
  }

  async leaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardEntry[]> {
    return computeLeaderboard([...this.runs.values()].flatMap((e) => [...e.results.values()]), query);
  }

  private toStoredRun(entry: RunEntry): StoredRun {
    return {
      runId: entry.record.runId,
      status: entry.status,
      config: entry.record.config,
      createdAt: entry.record.createdAt,
      ...(entry.finishedAt ? { finishedAt: entry.finishedAt } : {}),
      ...(entry.summary ? { summary: entry.summary } : {}),
    };
  }
}

/** Category buckets that a leaderboard "dimension" maps onto. */
const DIMENSION_CATEGORY: Record<string, string | undefined> = {
  coding: "coding",
  math: "math",
  reasoning: "reasoning",
  "tool-use": "tool-use",
};

/**
 * Aggregate task results into a ranked leaderboard. Shared by the in-memory and
 * (conceptually) the SQL store — ranking logic lives in one place.
 */
export function computeLeaderboard(
  results: TaskResult[],
  query: LeaderboardQuery = {},
): LeaderboardEntry[] {
  const dimension = query.dimension ?? "overall";
  const category = DIMENSION_CATEGORY[dimension];

  let filtered = results;
  if (query.benchmarkId) filtered = filtered.filter((r) => r.benchmarkId === query.benchmarkId);
  if (query.provider) filtered = filtered.filter((r) => r.model.provider === query.provider);
  if (query.temperature !== undefined) {
    filtered = filtered.filter((r) => (r.model.params?.temperature ?? undefined) === query.temperature);
  }
  if (query.since) filtered = filtered.filter((r) => r.createdAt >= query.since!);
  if (query.until) filtered = filtered.filter((r) => r.createdAt <= query.until!);
  if (category) {
    filtered = filtered.filter((r) => categoryOf(r) === category);
  }

  const groups = new Map<string, { provider: string; model: string; scores: number[]; latency: number[]; cost: number; runs: Set<string>; updatedAt: Timestamp }>();
  for (const r of filtered) {
    const key = `${r.model.provider}:${r.model.model}`;
    let g = groups.get(key);
    if (!g) {
      g = { provider: r.model.provider, model: r.model.model, scores: [], latency: [], cost: 0, runs: new Set(), updatedAt: r.createdAt };
      groups.set(key, g);
    }
    g.scores.push(r.grade.score);
    g.latency.push(r.latencyMs);
    g.cost += r.cost?.total ?? 0;
    g.runs.add(r.runId);
    if (r.createdAt > g.updatedAt) g.updatedAt = r.createdAt;
  }

  const entries = [...groups.values()].map((g) => {
    const mean = g.scores.length ? g.scores.reduce((s, x) => s + x, 0) / g.scores.length : 0;
    const meanLatency = g.latency.length ? g.latency.reduce((s, x) => s + x, 0) / g.latency.length : 0;
    const score =
      dimension === "latency" ? meanLatency : dimension === "cost" ? g.cost : mean;
    return {
      model: g.model,
      provider: g.provider,
      score,
      metric: (dimension === "latency" ? "meanLatencyMs" : dimension === "cost" ? "totalCostUsd" : "accuracy") as LeaderboardEntry["metric"],
      runs: g.runs.size,
      samples: g.scores.length,
      meanLatencyMs: meanLatency,
      totalCostUsd: g.cost,
      updatedAt: g.updatedAt,
    };
  });

  // Latency & cost rank ascending (lower is better); everything else descending.
  const ascending = dimension === "latency" || dimension === "cost";
  entries.sort((a, b) => (ascending ? a.score - b.score : b.score - a.score));
  const ranked = entries.map((e, i) => ({ rank: i + 1, ...e }));
  return query.limit ? ranked.slice(0, query.limit) : ranked;
}

function categoryOf(r: TaskResult): string | undefined {
  const cat = (r.request.metadata?.category ?? undefined) as string | undefined;
  return cat;
}
