import type { BenchmarkId, DatasetId, Metadata } from "./common.js";
import type { GenerateRequest, ModelResponse, SamplingParams } from "./provider.js";
import type { MetricName } from "./metrics.js";
import type { Evaluator, EvaluatorSpec } from "./evaluator.js";

/** Top-level capability areas, mirroring the benchmark categories in the spec. */
export type BenchmarkCategory =
  | "coding"
  | "math"
  | "reasoning"
  | "knowledge"
  | "long-context"
  | "tool-use"
  | "agent"
  | "safety"
  | "custom";

/**
 * A single evaluation item. This is the canonical dataset row from the spec
 * (`{ id, prompt, expected, metadata }`) generalized to support multiple-choice
 * questions, chat-style inputs, and per-item grading context.
 */
export interface BenchmarkTask {
  id: string;
  /** The problem statement. Either a raw prompt or a full chat transcript. */
  input: string | { messages: GenerateRequest["messages"] };
  /** The gold answer, when one exists (free-form or a choice key). */
  expected?: string;
  /** Choice labels for multiple-choice tasks, e.g. `["A","B","C","D"]`. */
  choices?: string[];
  /** Reference material a judge may use (rubric, canonical solution, tests). */
  reference?: string;
  category?: BenchmarkCategory;
  tags?: string[];
  metadata?: Metadata;
}

/**
 * The normalized answer extracted from a raw model response by a benchmark's
 * `parseOutput`. Keeping extraction separate from grading lets the same output
 * be graded by different judges.
 */
export interface ParsedOutput {
  /** The raw assistant text. */
  raw: string;
  /** The normalized answer (e.g. a choice letter, a number, extracted code). */
  value: string;
  /** Optional structured payload (parsed JSON, tool calls, code blocks). */
  parsed?: unknown;
}

export interface DatasetSource {
  kind: "inline" | "file" | "huggingface" | "url";
  location?: string;
  split?: string;
  revision?: string;
}

export interface Dataset {
  id: DatasetId;
  name: string;
  version: string;
  description?: string;
  tasks: BenchmarkTask[];
  /** Content hash of the tasks — the dataset's reproducible fingerprint. */
  contentHash: string;
  source?: DatasetSource;
  metadata?: Metadata;
}

export interface LoadOptions {
  /** Cap the number of tasks (after optional shuffle). */
  limit?: number;
  shuffle?: boolean;
  seed?: string | number;
  split?: string;
  /** Keep only tasks matching this predicate. */
  filter?: (task: BenchmarkTask) => boolean;
}

/**
 * The benchmark contract. A benchmark owns four responsibilities: providing its
 * tasks, turning a task into a model request, extracting the answer from a
 * response, and declaring how to grade it. Concrete benchmarks are one file each
 * and self-register — the engine never imports them directly.
 */
export interface Benchmark {
  readonly id: BenchmarkId;
  readonly name: string;
  readonly version: string;
  readonly category: BenchmarkCategory;
  readonly description?: string;
  /** Version tag for the prompt template — bump when the wording changes. */
  readonly promptVersion: string;
  /** Sensible sampling defaults for this benchmark (e.g. temperature 0). */
  readonly defaultParams?: SamplingParams;
  /** Metrics this benchmark reports, in priority order (first = headline). */
  readonly metrics: MetricName[];
  /** How to grade outputs — an evaluator instance or a declarative spec. */
  readonly evaluator: Evaluator | EvaluatorSpec;
  readonly tags?: string[];

  /** Load (and optionally sample) the benchmark's tasks. */
  loadTasks(options?: LoadOptions): Promise<BenchmarkTask[]>;
  /** Construct the model request for one task. */
  buildRequest(task: BenchmarkTask): GenerateRequest;
  /** Extract the normalized answer from a model response. */
  parseOutput(response: ModelResponse, task: BenchmarkTask): ParsedOutput;
}
