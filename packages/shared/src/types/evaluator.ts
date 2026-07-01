import type { Metadata } from "./common.js";
import type { BenchmarkTask, ParsedOutput } from "./benchmark.js";
import type { Cost, ModelConfig, ModelResponse } from "./provider.js";

/** Built-in grading strategies. Custom judges register new kinds. */
export type EvaluatorKind =
  | "exact-match"
  | "regex"
  | "numeric"
  | "includes"
  | "choice"
  | "json-schema"
  | "semantic-similarity"
  | "llm-judge"
  | "code-exec"
  | "composite"
  | "custom";

/** Everything a judge needs to grade one response. */
export interface GradeInput {
  task: BenchmarkTask;
  response: ModelResponse;
  output: ParsedOutput;
  /** The model under test (available to judges that adjust for it). */
  model?: ModelConfig;
}

/**
 * A grade. `score` is normalized to [0, 1]; `passed` is the boolean view used by
 * pass-rate metrics. Judges may attach a rationale and sub-scores (e.g. a
 * rubric's individual criteria).
 */
export interface GradeResult {
  score: number;
  passed: boolean;
  /** Optional discrete label, e.g. "correct" | "partial" | "incorrect". */
  label?: string;
  /** Human-readable explanation (especially for LLM judges). */
  rationale?: string;
  /** Named sub-scores, each in [0, 1]. */
  subScores?: Record<string, number>;
  /** Cost incurred by the judge itself (LLM judges call a model). */
  judgeCost?: Cost;
  metadata?: Metadata;
}

/**
 * The judge contract. One method: grade an input into a normalized result.
 * Deterministic judges (exact match) and stochastic ones (LLM judge) share it.
 */
export interface Evaluator {
  readonly kind: EvaluatorKind;
  grade(input: GradeInput): Promise<GradeResult>;
}

// ── Declarative evaluator specs ───────────────────────────────────────────────
// A benchmark can either hand the engine a live `Evaluator` or a serializable
// `EvaluatorSpec` that a factory turns into one. Specs are what get stored in the
// database and edited in the dashboard.

export interface ExactMatchSpec {
  kind: "exact-match";
  caseSensitive?: boolean;
  trim?: boolean;
  /** Strip punctuation and collapse whitespace before comparing. */
  normalize?: boolean;
}

export interface RegexSpec {
  kind: "regex";
  pattern: string;
  flags?: string;
}

export interface NumericSpec {
  kind: "numeric";
  /** Absolute tolerance. */
  tolerance?: number;
  /** Relative tolerance (fraction of expected). */
  relativeTolerance?: number;
}

export interface IncludesSpec {
  kind: "includes";
  caseSensitive?: boolean;
  /** Require all reference substrings vs. any. */
  mode?: "all" | "any";
}

export interface ChoiceSpec {
  kind: "choice";
  caseSensitive?: boolean;
}

export interface JsonSchemaSpec {
  kind: "json-schema";
  schema: Record<string, unknown>;
}

export interface SemanticSimilaritySpec {
  kind: "semantic-similarity";
  embeddingModel: ModelConfig;
  threshold?: number;
}

export interface LlmJudgeSpec {
  kind: "llm-judge";
  judgeModel: ModelConfig;
  /** Rubric / instructions. Supports `{prompt} {expected} {output}` templating. */
  rubric?: string;
  /** Scale to elicit from the judge; score is normalized to [0,1]. */
  scale?: { min: number; max: number };
  passThreshold?: number;
}

export interface CodeExecSpec {
  kind: "code-exec";
  language: "python" | "javascript" | "typescript";
  /** How to obtain the test harness for a task (from `reference` by default). */
  testsFrom?: "reference" | "metadata";
  timeoutMs?: number;
  /** k values to estimate pass@k for. */
  passK?: number[];
}

export interface CompositeSpec {
  kind: "composite";
  /** Weighted combination of sub-evaluators. */
  components: Array<{ spec: EvaluatorSpec; weight?: number }>;
}

export interface CustomSpec {
  kind: "custom";
  /** Registry id of a user-provided evaluator factory. */
  ref: string;
  options?: Record<string, unknown>;
}

export type EvaluatorSpec =
  | ExactMatchSpec
  | RegexSpec
  | NumericSpec
  | IncludesSpec
  | ChoiceSpec
  | JsonSchemaSpec
  | SemanticSimilaritySpec
  | LlmJudgeSpec
  | CodeExecSpec
  | CompositeSpec
  | CustomSpec;

/** Factory that builds an `Evaluator` from a spec (registered per kind). */
export type EvaluatorFactory = (spec: EvaluatorSpec) => Evaluator;
