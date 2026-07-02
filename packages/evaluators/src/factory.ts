/**
 * The evaluator factory: turn a serializable {@link EvaluatorSpec} (the thing
 * stored in the database and edited in the dashboard) into a live {@link Evaluator}.
 *
 * Judges that call a model (semantic similarity, LLM-judge) receive a
 * `resolveProvider` from the build context, and code-exec receives a sandbox — so
 * this package never imports `@evalforge/providers` directly, preserving the
 * dependency direction. Custom judges are looked up in the shared
 * `evaluatorRegistry` by their `ref`.
 */

import { ConfigError, evaluatorRegistry, registerEvaluator } from "@evalforge/shared";
import type { Evaluator, EvaluatorSpec, ModelConfig, ModelProvider } from "@evalforge/shared";
import {
  ChoiceEvaluator,
  ExactMatchEvaluator,
  IncludesEvaluator,
  JsonSchemaEvaluator,
  NumericEvaluator,
  RegexEvaluator,
} from "./deterministic.js";
import { SemanticSimilarityEvaluator } from "./semantic.js";
import { LlmJudgeEvaluator } from "./llm-judge.js";
import { CodeExecEvaluator } from "./code-exec.js";
import { CompositeEvaluator } from "./composite.js";
import type { Sandbox } from "./sandbox.js";
import { defaultSandbox } from "./sandbox.js";

export interface EvaluatorContext {
  /** Resolve a live provider for judge models (injected by the engine). */
  resolveProvider?: (model: ModelConfig) => ModelProvider;
  /** Sandbox for code-exec (defaults to the local sandbox). */
  sandbox?: Sandbox;
}

/** Build a live evaluator from a spec and context. Pure dispatch — no I/O. */
export function buildEvaluator(spec: EvaluatorSpec, ctx: EvaluatorContext = {}): Evaluator {
  switch (spec.kind) {
    case "exact-match":
      return new ExactMatchEvaluator(spec);
    case "regex":
      return new RegexEvaluator(spec);
    case "numeric":
      return new NumericEvaluator(spec);
    case "includes":
      return new IncludesEvaluator(spec);
    case "choice":
      return new ChoiceEvaluator(spec);
    case "json-schema":
      return new JsonSchemaEvaluator(spec);
    case "semantic-similarity": {
      const resolve = requireResolver(ctx, "semantic-similarity");
      return new SemanticSimilarityEvaluator(spec, resolve);
    }
    case "llm-judge": {
      const resolve = requireResolver(ctx, "llm-judge");
      return new LlmJudgeEvaluator(spec, resolve);
    }
    case "code-exec":
      return new CodeExecEvaluator(spec, ctx.sandbox ?? defaultSandbox);
    case "composite":
      return new CompositeEvaluator(
        spec.components.map((c) => ({ evaluator: buildEvaluator(c.spec, ctx), weight: c.weight ?? 1 })),
      );
    case "custom": {
      const factory = evaluatorRegistry.tryGet(spec.ref);
      if (!factory) {
        throw new ConfigError(`Unknown custom evaluator "${spec.ref}"`, {
          registered: evaluatorRegistry.keys(),
        });
      }
      return factory(spec);
    }
    default: {
      const exhaustive: never = spec;
      throw new ConfigError(`Unsupported evaluator spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function requireResolver(
  ctx: EvaluatorContext,
  kind: string,
): NonNullable<EvaluatorContext["resolveProvider"]> {
  if (!ctx.resolveProvider) {
    throw new ConfigError(`evaluator "${kind}" requires a provider resolver in the build context`);
  }
  return ctx.resolveProvider;
}

/**
 * Normalize a benchmark's `evaluator` field (which may already be a live
 * `Evaluator` or a declarative spec) into a live evaluator.
 */
export function resolveEvaluator(
  evaluator: Evaluator | EvaluatorSpec,
  ctx: EvaluatorContext = {},
): Evaluator {
  return "grade" in evaluator ? evaluator : buildEvaluator(evaluator, ctx);
}

/**
 * Register the context-free built-in kinds in the shared registry so they are
 * discoverable and overridable. Judge/sandbox kinds are built via
 * {@link buildEvaluator} because they need context.
 */
export function registerBuiltinEvaluators(): void {
  registerEvaluator("exact-match", (spec) => buildEvaluator(spec));
  registerEvaluator("regex", (spec) => buildEvaluator(spec));
  registerEvaluator("numeric", (spec) => buildEvaluator(spec));
  registerEvaluator("includes", (spec) => buildEvaluator(spec));
  registerEvaluator("choice", (spec) => buildEvaluator(spec));
  registerEvaluator("json-schema", (spec) => buildEvaluator(spec));
}

registerBuiltinEvaluators();
