/**
 * The executor runs a single {@link WorkItem} through the middle of the pipeline:
 * build the request → cache lookup → `provider.generate` (with timeout + retry) →
 * `benchmark.parseOutput` → `evaluator.grade` → a persisted {@link TaskResult}.
 *
 * Failures are captured, not thrown: a task that errors after its retries becomes
 * a scored-zero result carrying the error, so one bad item never aborts the run
 * (the run ends `partial`, and every other item still completes).
 */

import {
  EvalForgeError,
  cacheKey,
  id,
  toEvalForgeError,
  withRetry,
  withTimeout,
} from "@evalforge/shared";
import type {
  Evaluator,
  GenerateRequest,
  GradeResult,
  ModelConfig,
  ModelProvider,
  ModelResponse,
  ParsedOutput,
  ResponseCache,
  RunConfig,
  RunId,
  SamplingParams,
  TaskResult,
} from "@evalforge/shared";
import type { WorkItem } from "./planner.js";

export interface ExecutionContext {
  runId: RunId;
  config: RunConfig;
  cache: ResponseCache;
  /** Resolve (and memoize) a provider for a model config. */
  getProvider: (model: ModelConfig) => ModelProvider;
  /** Resolve (and memoize) a live evaluator for a benchmark id. */
  getEvaluator: (item: WorkItem) => Evaluator;
}

/** Merge sampling params with the correct precedence: model > benchmark > run seed. */
export function resolveParams(item: WorkItem, config: RunConfig): SamplingParams {
  const base = item.benchmark.buildRequest(item.task).params ?? {};
  const params: SamplingParams = {
    ...item.benchmark.defaultParams,
    ...base,
    ...item.model.params,
  };
  if (params.seed === undefined && config.seed !== undefined) {
    // Vary the seed by repeat index so repeats aren't identical samples.
    params.seed = config.seed + item.repeatIndex;
  }
  return params;
}

/** Construct the exact request that will be sent (and stored for replay). */
export function buildRequest(item: WorkItem, config: RunConfig): GenerateRequest {
  const base = item.benchmark.buildRequest(item.task);
  return { ...base, model: item.model.model, params: resolveParams(item, config) };
}

export async function executeItem(item: WorkItem, ctx: ExecutionContext): Promise<TaskResult> {
  const { config } = ctx;
  const request = buildRequest(item, config);
  const provider = ctx.getProvider(item.model);
  const createdAt = new Date().toISOString();

  const key = cacheKey({
    provider: item.model.provider,
    model: item.model.model,
    params: request.params,
    request: { messages: request.messages, system: request.system, tools: request.tools, responseFormat: request.responseFormat, metadata: request.metadata },
  });

  let attempts = 0;
  let cached = false;

  try {
    const useCache = config.cache !== false;
    let response = useCache ? await ctx.cache.get(key) : null;
    if (response) {
      cached = true;
    } else {
      const maxAttempts = Math.max(1, 1 + (config.retries ?? 3));
      const timeoutMs = config.timeoutMs ?? 120_000;
      response = await withRetry(
        () => {
          attempts++;
          return withTimeout(
            provider.generate(request, { timeoutMs }),
            timeoutMs,
            `${provider.name}.generate`,
          );
        },
        {
          retries: maxAttempts,
          shouldRetry: (error) => (error instanceof EvalForgeError ? error.retryable : true),
        },
      );
      if (useCache) await ctx.cache.set(key, response);
    }

    const output: ParsedOutput = item.benchmark.parseOutput(response, item.task);
    const grade = await gradeSafely(ctx.getEvaluator(item), item, response, output);
    const cost = response.cost ?? provider.estimateCost(response.usage, item.model.model);

    return {
      id: id("res"),
      runId: ctx.runId,
      benchmarkId: item.benchmark.id,
      taskId: item.task.id,
      model: item.model,
      repeatIndex: item.repeatIndex,
      promptVersion: item.benchmark.promptVersion,
      request,
      output,
      grade,
      usage: response.usage,
      ...(cost ? { cost } : {}),
      latencyMs: response.latencyMs,
      attempts: Math.max(1, attempts),
      cached: cached || Boolean(response.cached),
      createdAt,
    };
  } catch (error) {
    const efe = toEvalForgeError(error);
    return {
      id: id("res"),
      runId: ctx.runId,
      benchmarkId: item.benchmark.id,
      taskId: item.task.id,
      model: item.model,
      repeatIndex: item.repeatIndex,
      promptVersion: item.benchmark.promptVersion,
      request,
      output: { raw: "", value: "" },
      grade: { score: 0, passed: false, label: "error", rationale: efe.message },
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0,
      attempts: Math.max(1, attempts),
      cached: false,
      error: { code: efe.code, message: efe.message },
      createdAt,
    };
  }
}

async function gradeSafely(
  evaluator: Evaluator,
  item: WorkItem,
  response: ModelResponse,
  output: ParsedOutput,
): Promise<GradeResult> {
  try {
    return await evaluator.grade({ task: item.task, response, output, model: item.model });
  } catch (error) {
    const efe = toEvalForgeError(error);
    return { score: 0, passed: false, label: "grade-error", rationale: efe.message };
  }
}
