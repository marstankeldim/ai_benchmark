/**
 * Mapping between EvalForge domain objects and Prisma rows. JSON columns hold the
 * canonical domain objects (RunConfig, GenerateRequest, GradeResult…), so nothing
 * is lost on the round trip.
 *
 * Identity note: a result's `model` *column* stores the run label
 * (`model.label ?? provider:model`) — the identity used for dedupe and resume, so
 * it matches the engine's `resultKey`. The exact model id lives in the stored
 * request snapshot, from which the full `ModelConfig` is reconstructed on read.
 */

import type { Prisma } from "@prisma/client";
import type {
  GenerateRequest,
  ModelConfig,
  RunStatus,
  StoredRun,
  TaskResult,
} from "@evalforge/shared";

export const modelLabel = (m: ModelConfig): string => m.label ?? `${m.provider}:${m.model}`;

const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/** Columns needed to build a TaskResult row (minus relations). */
export function toTaskResultCreate(result: TaskResult): Prisma.TaskResultCreateInput {
  return {
    run: { connect: { id: result.runId } },
    benchmark: { connect: { id: result.benchmarkId } },
    taskId: result.taskId,
    provider: result.model.provider,
    model: modelLabel(result.model),
    params: result.model.params ? json(result.model.params) : undefined,
    promptVersion: result.promptVersion,
    repeatIndex: result.repeatIndex,
    request: json(result.request),
    output: json(result.output),
    score: result.grade.score,
    passed: result.grade.passed,
    label: result.grade.label ?? null,
    rationale: result.grade.rationale ?? null,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    totalTokens: result.usage.totalTokens,
    costUsd: result.cost?.total ?? null,
    latencyMs: Math.round(result.latencyMs),
    attempts: result.attempts,
    cached: result.cached,
    error: result.error ? json(result.error) : undefined,
  };
}

/** A Prisma TaskResult row shape (only the fields we read back). */
export interface TaskResultRow {
  runId: string;
  benchmarkId: string;
  taskId: string;
  provider: string;
  model: string;
  params: unknown;
  promptVersion: string;
  repeatIndex: number;
  request: unknown;
  output: unknown;
  score: number;
  passed: boolean;
  label: string | null;
  rationale: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  attempts: number;
  cached: boolean;
  error: unknown;
  createdAt: Date;
}

/** Reconstruct a domain TaskResult from a stored row. */
export function fromTaskResultRow(row: TaskResultRow): TaskResult {
  const request = row.request as GenerateRequest;
  const model: ModelConfig = {
    provider: row.provider,
    model: request?.model ?? row.model,
    label: row.model,
    ...(row.params ? { params: row.params as ModelConfig["params"] } : {}),
  };
  return {
    id: `${row.runId}:${row.benchmarkId}:${row.model}:${row.taskId}:${row.repeatIndex}`,
    runId: row.runId,
    benchmarkId: row.benchmarkId,
    taskId: row.taskId,
    model,
    repeatIndex: row.repeatIndex,
    promptVersion: row.promptVersion,
    request,
    output: row.output as TaskResult["output"],
    grade: {
      score: row.score,
      passed: row.passed,
      ...(row.label ? { label: row.label } : {}),
      ...(row.rationale ? { rationale: row.rationale } : {}),
    },
    usage: {
      promptTokens: row.promptTokens ?? 0,
      completionTokens: row.completionTokens ?? 0,
      totalTokens: row.totalTokens ?? 0,
    },
    ...(row.costUsd != null
      ? { cost: { input: 0, output: 0, total: row.costUsd, currency: "USD" as const } }
      : {}),
    latencyMs: row.latencyMs,
    attempts: row.attempts,
    cached: row.cached,
    ...(row.error ? { error: row.error as TaskResult["error"] } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

/** A Prisma Run row shape (only the fields we read back). */
export interface RunRow {
  id: string;
  status: string;
  config: unknown;
  environment: unknown;
  summary: unknown;
  createdAt: Date;
  finishedAt: Date | null;
}

export function fromRunRow(row: RunRow): StoredRun {
  return {
    runId: row.id,
    status: row.status as RunStatus,
    config: row.config as StoredRun["config"],
    createdAt: row.createdAt.toISOString(),
    ...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() } : {}),
    ...(row.summary ? { summary: row.summary as StoredRun["summary"] } : {}),
  };
}
