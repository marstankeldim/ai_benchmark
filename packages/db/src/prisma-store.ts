/**
 * `PrismaRunStore` — the Postgres implementation of the engine's {@link RunStore}
 * port. It satisfies the exact same interface as the in-memory and filesystem
 * stores, so switching EvalForge to a durable, queryable, multi-writer backend is
 * a one-line change (`new PrismaRunStore()` instead of `new InMemoryRunStore()`).
 *
 * JSON columns preserve the full domain objects; a pre-aggregated `MetricRecord`
 * table (written on `saveSummary`) keeps leaderboards a single indexed scan.
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
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "./client.js";
import {
  fromRunRow,
  fromTaskResultRow,
  modelLabel,
  toTaskResultCreate,
  type TaskResultRow,
} from "./mappers.js";

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

const DIMENSION_CATEGORY: Record<string, string | undefined> = {
  coding: "coding",
  math: "math",
  reasoning: "reasoning",
  "tool-use": "tool-use",
  knowledge: "knowledge",
};

export class PrismaRunStore implements RunStore {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  async createRun(run: RunRecord): Promise<void> {
    await this.prisma.run.upsert({
      where: { id: run.runId },
      update: {},
      create: {
        id: run.runId,
        status: run.status,
        config: asJson(run.config),
        environment: asJson(run.environment),
        seed: run.config.seed ?? null,
        createdAt: new Date(run.createdAt),
      },
    });
  }

  async updateRunStatus(runId: RunId, status: RunStatus, finishedAt?: Timestamp): Promise<void> {
    await this.prisma.run.update({
      where: { id: runId },
      data: { status, ...(finishedAt ? { finishedAt: new Date(finishedAt) } : {}) },
    });
  }

  async saveSummary(summary: RunSummary): Promise<void> {
    await this.prisma.run.update({
      where: { id: summary.runId },
      data: {
        summary: asJson(summary),
        status: summary.status,
        ...(summary.finishedAt ? { finishedAt: new Date(summary.finishedAt) } : {}),
      },
    });
    await this.writeMetricRecords(summary);
  }

  async saveResult(result: TaskResult): Promise<void> {
    await this.ensureBenchmark(result);
    const create = toTaskResultCreate(result);
    await this.prisma.taskResult.upsert({
      where: {
        runId_benchmarkId_model_taskId_repeatIndex: {
          runId: result.runId,
          benchmarkId: result.benchmarkId,
          model: modelLabel(result.model),
          taskId: result.taskId,
          repeatIndex: result.repeatIndex,
        },
      },
      update: create,
      create,
    });
  }

  async saveResults(results: TaskResult[]): Promise<void> {
    for (const r of results) await this.saveResult(r);
  }

  async completedTaskKeys(runId: RunId): Promise<Set<string>> {
    const rows = await this.prisma.taskResult.findMany({
      where: { runId },
      select: { benchmarkId: true, model: true, taskId: true, repeatIndex: true },
    });
    return new Set(rows.map((r) => `${r.benchmarkId}::${r.model}::${r.taskId}::${r.repeatIndex}`));
  }

  async getRun(runId: RunId): Promise<StoredRun | null> {
    const row = await this.prisma.run.findUnique({ where: { id: runId } });
    return row ? fromRunRow(row) : null;
  }

  async listRuns(query: RunQuery = {}): Promise<StoredRun[]> {
    const rows = await this.prisma.run.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.since || query.until
          ? {
              createdAt: {
                ...(query.since ? { gte: new Date(query.since) } : {}),
                ...(query.until ? { lte: new Date(query.until) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      ...(query.limit ? { take: query.limit } : {}),
      ...(query.offset ? { skip: query.offset } : {}),
    });
    let runs = rows.map(fromRunRow);
    // benchmark/provider/model filters live inside the JSON config.
    if (query.benchmarkId) runs = runs.filter((r) => r.config.benchmarks.includes(query.benchmarkId!));
    if (query.provider) runs = runs.filter((r) => r.config.models.some((m) => m.provider === query.provider));
    if (query.model) runs = runs.filter((r) => r.config.models.some((m) => m.model === query.model));
    return runs;
  }

  async getResults(query: ResultQuery): Promise<TaskResult[]> {
    const rows = await this.prisma.taskResult.findMany({
      where: {
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.benchmarkId ? { benchmarkId: query.benchmarkId } : {}),
        ...(query.passed !== undefined ? { passed: query.passed } : {}),
      },
      orderBy: { createdAt: "asc" },
      ...(query.limit ? { take: query.limit } : {}),
      ...(query.offset ? { skip: query.offset } : {}),
    });
    let results = rows.map((r) => fromTaskResultRow(r as unknown as TaskResultRow));
    if (query.model) results = results.filter((r) => r.model.model === query.model);
    return results;
  }

  async leaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardEntry[]> {
    const dimension = query.dimension ?? "overall";
    const category = DIMENSION_CATEGORY[dimension];
    const rows = await this.prisma.taskResult.findMany({
      where: {
        ...(query.benchmarkId ? { benchmarkId: query.benchmarkId } : {}),
        ...(query.provider ? { provider: query.provider } : {}),
        ...(category ? { benchmark: { category } } : {}),
        ...(query.since || query.until
          ? {
              createdAt: {
                ...(query.since ? { gte: new Date(query.since) } : {}),
                ...(query.until ? { lte: new Date(query.until) } : {}),
              },
            }
          : {}),
      },
      select: { provider: true, model: true, score: true, latencyMs: true, costUsd: true, runId: true, createdAt: true },
    });

    const groups = new Map<
      string,
      { provider: string; model: string; scores: number[]; latency: number[]; cost: number; runs: Set<string>; updatedAt: Date }
    >();
    for (const r of rows) {
      const key = `${r.provider}:${r.model}`;
      let g = groups.get(key);
      if (!g) {
        g = { provider: r.provider, model: r.model, scores: [], latency: [], cost: 0, runs: new Set(), updatedAt: r.createdAt };
        groups.set(key, g);
      }
      g.scores.push(r.score);
      g.latency.push(r.latencyMs);
      g.cost += r.costUsd ?? 0;
      g.runs.add(r.runId);
      if (r.createdAt > g.updatedAt) g.updatedAt = r.createdAt;
    }

    const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const entries = [...groups.values()].map((g) => {
      const meanLatency = mean(g.latency);
      const score = dimension === "latency" ? meanLatency : dimension === "cost" ? g.cost : mean(g.scores);
      return {
        model: g.model,
        provider: g.provider,
        score,
        metric: (dimension === "latency" ? "meanLatencyMs" : dimension === "cost" ? "totalCostUsd" : "accuracy") as LeaderboardEntry["metric"],
        runs: g.runs.size,
        samples: g.scores.length,
        meanLatencyMs: meanLatency,
        totalCostUsd: g.cost,
        updatedAt: g.updatedAt.toISOString(),
      };
    });

    const ascending = dimension === "latency" || dimension === "cost";
    entries.sort((a, b) => (ascending ? a.score - b.score : b.score - a.score));
    const ranked = entries.map((e, i) => ({ rank: i + 1, ...e }));
    return query.limit ? ranked.slice(0, query.limit) : ranked;
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /** Ensure a Benchmark row exists so the TaskResult FK resolves. */
  private async ensureBenchmark(result: TaskResult): Promise<void> {
    await this.prisma.benchmark.upsert({
      where: { id: result.benchmarkId },
      update: {},
      create: {
        id: result.benchmarkId,
        name: result.benchmarkId,
        version: "unknown",
        category: (result.request.metadata?.category as string) ?? "custom",
        promptVersion: result.promptVersion,
      },
    });
  }

  /** Pre-aggregate per (model × benchmark × metric) metrics for fast leaderboards. */
  private async writeMetricRecords(summary: RunSummary): Promise<void> {
    await this.prisma.metricRecord.deleteMany({ where: { runId: summary.runId } });
    const data: Prisma.MetricRecordCreateManyInput[] = [];
    for (const m of summary.byModel) {
      const label = modelLabel(m.model);
      for (const b of m.byBenchmark) {
        for (const [metric, value] of Object.entries(b.metrics)) {
          if (value === undefined) continue;
          const iv = b.intervals[metric];
          data.push({
            runId: summary.runId,
            provider: m.model.provider,
            model: label,
            benchmarkId: b.benchmarkId,
            category: b.category,
            metric,
            value,
            ciLow: iv?.low ?? null,
            ciHigh: iv?.high ?? null,
            n: b.n,
          });
        }
      }
    }
    if (data.length > 0) await this.prisma.metricRecord.createMany({ data });
  }
}
