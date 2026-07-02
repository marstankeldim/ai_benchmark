/**
 * The engine — orchestration of the whole pipeline:
 *
 *   plan → execute (bounded-concurrency pool) → grade → persist → aggregate → summary
 *
 * It depends only on interfaces from `@evalforge/shared` (`RunStore`,
 * `ResponseCache`, `ModelProvider`, `Evaluator`), with sensible in-process
 * defaults, so the same code runs against an in-memory store locally and Postgres
 * in production. Runs are resumable (skip already-graded items), cancelable (via
 * `AbortSignal`), and stream {@link ProgressEvent}s for CLIs and the API.
 */

import {
  buildEnvironment,
  createLogger,
  mapWithConcurrency,
  id as makeId,
} from "@evalforge/shared";
import type {
  Benchmark,
  Evaluator,
  Logger,
  ModelConfig,
  ModelProvider,
  ProgressListener,
  ResponseCache,
  RunConfig,
  RunId,
  RunStatus,
  RunStore,
  RunSummary,
} from "@evalforge/shared";
import { createProvider } from "@evalforge/providers";
import { resolveEvaluator, type Sandbox } from "@evalforge/evaluators";
import { planRun, type WorkItem } from "./planner.js";
import { executeItem, type ExecutionContext } from "./executor.js";
import { buildRunSummary } from "./aggregate.js";
import { InMemoryRunStore } from "./store/memory-store.js";
import { InMemoryResponseCache } from "./cache/memory-cache.js";

export interface EngineOptions {
  store?: RunStore;
  cache?: ResponseCache;
  /** Resolve a provider for a model config. Defaults to env-based `createProvider`. */
  providerResolver?: (model: ModelConfig) => ModelProvider;
  /** Sandbox for code-exec evaluators. */
  sandbox?: Sandbox;
  logger?: Logger;
  gitCommit?: string;
}

export interface RunOptions {
  onProgress?: ProgressListener;
  signal?: AbortSignal;
  /** Resume/continue this run id (skips already-graded items). */
  runId?: RunId;
}

export class Engine {
  private readonly store: RunStore;
  private readonly cache: ResponseCache;
  private readonly providerResolver: (model: ModelConfig) => ModelProvider;
  private readonly sandbox?: Sandbox;
  private readonly logger: Logger;
  private readonly gitCommit?: string;

  constructor(options: EngineOptions = {}) {
    this.store = options.store ?? new InMemoryRunStore();
    this.cache = options.cache ?? new InMemoryResponseCache();
    this.providerResolver = options.providerResolver ?? ((m) => createProvider(m.provider));
    if (options.sandbox) this.sandbox = options.sandbox;
    this.logger = options.logger ?? createLogger({ scope: "engine" });
    if (options.gitCommit) this.gitCommit = options.gitCommit;
  }

  getStore(): RunStore {
    return this.store;
  }

  /** Run (or resume) an evaluation and return its full summary. */
  async run(config: RunConfig, options: RunOptions = {}): Promise<RunSummary> {
    const runId = options.runId ?? makeId("run");
    const environment = buildEnvironment(this.gitCommit);
    const createdAt = new Date().toISOString();

    await this.store.createRun({ runId, status: "running", config, environment, createdAt });
    await this.store.updateRunStatus(runId, "running");

    const completed = await this.store.completedTaskKeys(runId);
    const plan = await planRun(config, { completed });
    this.logger.info("run planned", {
      runId,
      benchmarks: config.benchmarks.length,
      models: config.models.length,
      pending: plan.items.length,
      total: plan.totalTasks,
    });
    options.onProgress?.({ type: "run:start", runId, totalTasks: plan.totalTasks });

    const ctx = this.buildContext(runId, config);
    let done = completed.size;
    const total = plan.totalTasks;

    await mapWithConcurrency(
      plan.items,
      async (item: WorkItem) => {
        if (options.signal?.aborted) return;
        const result = await executeItem(item, ctx);
        await this.store.saveResult(result);
        done++;
        if (result.error) {
          options.onProgress?.({ type: "task:error", runId, taskId: item.task.id, message: result.error.message });
        } else {
          options.onProgress?.({ type: "task:done", runId, completed: done, total, result });
        }
      },
      {
        concurrency: config.concurrency ?? 8,
        ...(options.signal ? { signal: options.signal } : {}),
      },
    ).catch((error) => {
      if (options.signal?.aborted) return;
      throw error;
    });

    const allResults = await this.store.getResults({ runId });
    const failed = allResults.filter((r) => r.error).length;
    const status: RunStatus = options.signal?.aborted
      ? "canceled"
      : failed > 0
        ? "partial"
        : "completed";
    const finishedAt = new Date().toISOString();

    const summary = buildRunSummary({
      runId,
      status,
      config,
      environment,
      createdAt,
      finishedAt,
      results: allResults,
      benchmarks: plan.benchmarks,
      totalTasks: plan.totalTasks,
    });

    await this.store.saveSummary(summary);
    await this.store.updateRunStatus(runId, status, finishedAt);
    this.logger.info("run complete", { runId, status, completed: summary.stats.completed, failed });
    options.onProgress?.({ type: "run:complete", runId, summary });
    return summary;
  }

  private buildContext(runId: RunId, config: RunConfig): ExecutionContext {
    const providerMemo = new Map<string, ModelProvider>();
    const evaluatorMemo = new Map<string, Evaluator>();

    const getProvider = (model: ModelConfig): ModelProvider => {
      const key = `${model.provider}`;
      let p = providerMemo.get(key);
      if (!p) {
        p = this.providerResolver(model);
        providerMemo.set(key, p);
      }
      return p;
    };

    const getEvaluator = (item: WorkItem): Evaluator => {
      const bench: Benchmark = item.benchmark;
      let e = evaluatorMemo.get(bench.id);
      if (!e) {
        const override = config.evaluatorOverride?.[bench.id];
        e = resolveEvaluator(override ?? bench.evaluator, {
          resolveProvider: (m) => getProvider(m),
          ...(this.sandbox ? { sandbox: this.sandbox } : {}),
        });
        evaluatorMemo.set(bench.id, e);
      }
      return e;
    };

    return { runId, config, cache: this.cache, getProvider, getEvaluator };
  }
}

/** Convenience factory. */
export function createEngine(options?: EngineOptions): Engine {
  return new Engine(options);
}
