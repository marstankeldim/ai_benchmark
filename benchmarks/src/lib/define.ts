/**
 * `defineBenchmark` — the tiny factory every benchmark file uses. It wires inline
 * sample tasks to the `Benchmark` contract (adding a registry-friendly
 * `loadTasks` with seeded sampling) so each concrete benchmark file only declares
 * the interesting parts: its tasks, how to prompt, how to parse, and how to grade.
 */

import { applyLoadOptions } from "@evalforge/datasets";
import type {
  Benchmark,
  BenchmarkCategory,
  BenchmarkTask,
  Evaluator,
  EvaluatorSpec,
  GenerateRequest,
  LoadOptions,
  MetricName,
  ModelResponse,
  ParsedOutput,
  SamplingParams,
} from "@evalforge/shared";

export interface BenchmarkDefinition {
  id: string;
  name: string;
  version: string;
  category: BenchmarkCategory;
  description?: string;
  promptVersion: string;
  metrics: MetricName[];
  evaluator: Evaluator | EvaluatorSpec;
  defaultParams?: SamplingParams;
  tags?: string[];
  /** Inline sample tasks (real benchmarks can override `loadTasks`). */
  tasks: BenchmarkTask[];
  buildRequest: (task: BenchmarkTask) => GenerateRequest;
  parseOutput: (response: ModelResponse, task: BenchmarkTask) => ParsedOutput;
  /** Optional custom loader (e.g. fetch from HuggingFace); defaults to inline. */
  loadTasks?: (options?: LoadOptions) => Promise<BenchmarkTask[]>;
}

export function defineBenchmark(def: BenchmarkDefinition): Benchmark {
  const loadTasks =
    def.loadTasks ?? (async (options?: LoadOptions) => applyLoadOptions(def.tasks, options ?? {}));

  return {
    id: def.id,
    name: def.name,
    version: def.version,
    category: def.category,
    ...(def.description ? { description: def.description } : {}),
    promptVersion: def.promptVersion,
    metrics: def.metrics,
    evaluator: def.evaluator,
    ...(def.defaultParams ? { defaultParams: def.defaultParams } : {}),
    ...(def.tags ? { tags: def.tags } : {}),
    loadTasks,
    buildRequest: def.buildRequest,
    parseOutput: def.parseOutput,
  };
}
