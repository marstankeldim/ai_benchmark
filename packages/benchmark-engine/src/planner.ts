/**
 * Planning: turn a {@link RunConfig} into a flat list of independent work items,
 * the unit the executor pool consumes. One item = (model × benchmark × task ×
 * repeat). The planner also owns the {@link resultKey} — the stable identity of a
 * graded observation — which is what makes runs *resumable*: on restart we skip
 * items whose key is already present in the store.
 */

import { NotFoundError, benchmarkRegistry } from "@evalforge/shared";
import type { Benchmark, BenchmarkTask, ModelConfig, RunConfig } from "@evalforge/shared";
import { applyLoadOptions } from "@evalforge/datasets";

export interface WorkItem {
  benchmark: Benchmark;
  task: BenchmarkTask;
  model: ModelConfig;
  repeatIndex: number;
  /** Stable identity — see {@link resultKey}. */
  key: string;
}

export interface Plan {
  items: WorkItem[];
  /** Benchmarks referenced by the run, resolved once. */
  benchmarks: Benchmark[];
  totalTasks: number;
}

/**
 * The identity of one graded observation. Two runs that produce this key are
 * grading the same (benchmark, model, task, repeat) — so the store can dedupe and
 * the planner can resume.
 */
export function resultKey(
  benchmarkId: string,
  model: ModelConfig,
  taskId: string,
  repeatIndex: number,
): string {
  const label = model.label ?? `${model.provider}:${model.model}`;
  return `${benchmarkId}::${label}::${taskId}::${repeatIndex}`;
}

export interface PlanOptions {
  /** Resolve a benchmark id to a definition. Defaults to the shared registry. */
  resolveBenchmark?: (id: string) => Benchmark;
  /** Keys already completed (from the store) — items with these keys are skipped. */
  completed?: Set<string>;
}

/** Expand a run config into a concrete, ordered plan of work items. */
export async function planRun(config: RunConfig, options: PlanOptions = {}): Promise<Plan> {
  const resolve = options.resolveBenchmark ?? ((id: string) => benchmarkRegistry.get(id));
  const completed = options.completed ?? new Set<string>();
  const repeat = Math.max(1, config.repeat ?? 1);

  const benchmarks: Benchmark[] = [];
  const items: WorkItem[] = [];
  let totalTasks = 0;

  for (const benchmarkId of config.benchmarks) {
    const benchmark = resolve(benchmarkId);
    if (!benchmark) throw new NotFoundError("benchmark", benchmarkId);
    benchmarks.push(benchmark);

    const loadOpts = {
      ...(config.limit !== undefined ? { limit: config.limit } : {}),
      ...(config.split ? { split: config.split } : {}),
      ...(config.seed !== undefined ? { seed: config.seed } : {}),
    };
    const loaded = await benchmark.loadTasks(loadOpts);
    // Re-apply limit/seed defensively in case a benchmark ignores LoadOptions.
    const tasks = applyLoadOptions(loaded, loadOpts);

    for (const task of tasks) {
      for (const model of config.models) {
        for (let repeatIndex = 0; repeatIndex < repeat; repeatIndex++) {
          totalTasks++;
          const key = resultKey(benchmark.id, model, task.id, repeatIndex);
          if (completed.has(key)) continue;
          items.push({ benchmark, task, model, repeatIndex, key });
        }
      }
    }
  }

  return { items, benchmarks, totalTasks };
}
