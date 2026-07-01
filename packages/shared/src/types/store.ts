import type { RunId, Timestamp } from "./common.js";
import type { ModelResponse } from "./provider.js";
import type { RunConfig, RunRecord, RunStatus, RunSummary, TaskResult } from "./run.js";
import type { MetricName } from "./metrics.js";

/** A run as stored, with its summary once available. */
export interface StoredRun {
  runId: RunId;
  status: RunStatus;
  config: RunConfig;
  createdAt: Timestamp;
  finishedAt?: Timestamp;
  summary?: RunSummary;
}

export interface RunQuery {
  status?: RunStatus;
  benchmarkId?: string;
  provider?: string;
  model?: string;
  since?: Timestamp;
  until?: Timestamp;
  limit?: number;
  offset?: number;
}

export interface ResultQuery {
  runId?: RunId;
  benchmarkId?: string;
  model?: string;
  passed?: boolean;
  limit?: number;
  offset?: number;
}

export interface LeaderboardQuery {
  /** Rank by this metric/dimension. Default: overall. */
  dimension?: "overall" | "coding" | "math" | "reasoning" | "tool-use" | "latency" | "cost";
  benchmarkId?: string;
  provider?: string;
  since?: Timestamp;
  until?: Timestamp;
  temperature?: number;
  limit?: number;
}

export interface LeaderboardEntry {
  rank: number;
  model: string;
  provider: string;
  score: number;
  metric: MetricName;
  runs: number;
  samples: number;
  meanLatencyMs?: number;
  totalCostUsd?: number;
  /** Optional Elo rating when the leaderboard is arena-style. */
  elo?: number;
  updatedAt: Timestamp;
}

/**
 * Persistence port. The engine depends on this interface only — the in-memory
 * implementation ships in the engine; the Postgres/Prisma implementation ships
 * in `@evalforge/db`. Swapping backends never touches the engine.
 */
export interface RunStore {
  createRun(run: RunRecord): Promise<void>;
  updateRunStatus(runId: RunId, status: RunStatus, finishedAt?: Timestamp): Promise<void>;
  saveSummary(summary: RunSummary): Promise<void>;
  saveResult(result: TaskResult): Promise<void>;
  saveResults(results: TaskResult[]): Promise<void>;
  /** Task ids already graded for this run — the basis for resuming. */
  completedTaskKeys(runId: RunId): Promise<Set<string>>;
  getRun(runId: RunId): Promise<StoredRun | null>;
  listRuns(query?: RunQuery): Promise<StoredRun[]>;
  getResults(query: ResultQuery): Promise<TaskResult[]>;
  leaderboard(query?: LeaderboardQuery): Promise<LeaderboardEntry[]>;
}

/**
 * Caching port. Keys are content hashes of (provider, model, params, request);
 * a hit makes a run replayable with no provider calls. Implementations:
 * in-memory, filesystem, Redis.
 */
export interface ResponseCache {
  get(key: string): Promise<ModelResponse | null>;
  set(key: string, value: ModelResponse): Promise<void>;
  has?(key: string): Promise<boolean>;
  clear?(): Promise<void>;
}
