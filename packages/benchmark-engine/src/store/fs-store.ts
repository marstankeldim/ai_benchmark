/**
 * Filesystem {@link RunStore} — durable persistence with zero infrastructure.
 * Layout:
 *
 *   <root>/<runId>/run.json          the run record + status + summary
 *   <root>/<runId>/results/<hash>.json   one graded TaskResult each
 *
 * This gives the CLI and API real cross-process persistence and resume (an
 * interrupted run continues on restart) without Postgres. For a multi-writer,
 * queryable deployment, use `@evalforge/db`'s Postgres store behind this same
 * interface.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
import { safeJsonParse } from "@evalforge/shared";
import { resultKey } from "../planner.js";
import { computeLeaderboard } from "./memory-store.js";

interface RunFile {
  record: RunRecord;
  status: RunStatus;
  finishedAt?: Timestamp;
  summary?: RunSummary;
}

export class FileSystemRunStore implements RunStore {
  constructor(private readonly root: string) {}

  private runDir(runId: RunId): string {
    return join(this.root, encodeURIComponent(runId));
  }
  private resultsDir(runId: RunId): string {
    return join(this.runDir(runId), "results");
  }

  async createRun(run: RunRecord): Promise<void> {
    await mkdir(this.resultsDir(run.runId), { recursive: true });
    const existing = await this.readRunFile(run.runId);
    if (existing) return; // resume: keep prior record/results
    await this.writeRunFile(run.runId, { record: run, status: run.status });
  }

  async updateRunStatus(runId: RunId, status: RunStatus, finishedAt?: Timestamp): Promise<void> {
    const file = await this.readRunFile(runId);
    if (!file) return;
    file.status = status;
    if (finishedAt) file.finishedAt = finishedAt;
    await this.writeRunFile(runId, file);
  }

  async saveSummary(summary: RunSummary): Promise<void> {
    const file = (await this.readRunFile(summary.runId)) ?? {
      record: { runId: summary.runId, status: summary.status, config: summary.config, environment: summary.environment, createdAt: summary.createdAt },
      status: summary.status,
    };
    file.summary = summary;
    file.status = summary.status;
    if (summary.finishedAt) file.finishedAt = summary.finishedAt;
    await this.writeRunFile(summary.runId, file);
  }

  async saveResult(result: TaskResult): Promise<void> {
    await mkdir(this.resultsDir(result.runId), { recursive: true });
    const key = resultKey(result.benchmarkId, result.model, result.taskId, result.repeatIndex);
    const file = join(this.resultsDir(result.runId), `${hash(key)}.json`);
    await writeFile(file, JSON.stringify(result), "utf8");
  }

  async saveResults(results: TaskResult[]): Promise<void> {
    for (const r of results) await this.saveResult(r);
  }

  async completedTaskKeys(runId: RunId): Promise<Set<string>> {
    const results = await this.readResults(runId);
    return new Set(results.map((r) => resultKey(r.benchmarkId, r.model, r.taskId, r.repeatIndex)));
  }

  async getRun(runId: RunId): Promise<StoredRun | null> {
    const file = await this.readRunFile(runId);
    return file ? toStoredRun(file) : null;
  }

  async listRuns(query: RunQuery = {}): Promise<StoredRun[]> {
    let dirs: string[];
    try {
      dirs = await readdir(this.root);
    } catch {
      return [];
    }
    const runs: StoredRun[] = [];
    for (const dir of dirs) {
      const file = await this.readRunFile(decodeURIComponent(dir));
      if (file) runs.push(toStoredRun(file));
    }
    let filtered = runs;
    if (query.status) filtered = filtered.filter((r) => r.status === query.status);
    if (query.benchmarkId) filtered = filtered.filter((r) => r.config.benchmarks.includes(query.benchmarkId!));
    if (query.provider) filtered = filtered.filter((r) => r.config.models.some((m) => m.provider === query.provider));
    if (query.since) filtered = filtered.filter((r) => r.createdAt >= query.since!);
    if (query.until) filtered = filtered.filter((r) => r.createdAt <= query.until!);
    filtered.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const offset = query.offset ?? 0;
    return query.limit ? filtered.slice(offset, offset + query.limit) : filtered.slice(offset);
  }

  async getResults(query: ResultQuery): Promise<TaskResult[]> {
    let results: TaskResult[] = [];
    if (query.runId) {
      results = await this.readResults(query.runId);
    } else {
      const runs = await this.listRuns();
      for (const r of runs) results = results.concat(await this.readResults(r.runId));
    }
    if (query.benchmarkId) results = results.filter((r) => r.benchmarkId === query.benchmarkId);
    if (query.model) results = results.filter((r) => r.model.model === query.model);
    if (query.passed !== undefined) results = results.filter((r) => r.grade.passed === query.passed);
    const offset = query.offset ?? 0;
    return query.limit ? results.slice(offset, offset + query.limit) : results.slice(offset);
  }

  async leaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardEntry[]> {
    return computeLeaderboard(await this.getResults({}), query);
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async readRunFile(runId: RunId): Promise<RunFile | null> {
    try {
      const text = await readFile(join(this.runDir(runId), "run.json"), "utf8");
      return safeJsonParse<RunFile>(text) ?? null;
    } catch {
      return null;
    }
  }

  private async writeRunFile(runId: RunId, file: RunFile): Promise<void> {
    await mkdir(this.runDir(runId), { recursive: true });
    await writeFile(join(this.runDir(runId), "run.json"), JSON.stringify(file), "utf8");
  }

  private async readResults(runId: RunId): Promise<TaskResult[]> {
    let files: string[];
    try {
      files = await readdir(this.resultsDir(runId));
    } catch {
      return [];
    }
    const results: TaskResult[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const parsed = safeJsonParse<TaskResult>(await readFile(join(this.resultsDir(runId), f), "utf8"));
      if (parsed) results.push(parsed);
    }
    return results;
  }
}

function toStoredRun(file: RunFile): StoredRun {
  return {
    runId: file.record.runId,
    status: file.status,
    config: file.record.config,
    createdAt: file.record.createdAt,
    ...(file.finishedAt ? { finishedAt: file.finishedAt } : {}),
    ...(file.summary ? { summary: file.summary } : {}),
  };
}

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}
