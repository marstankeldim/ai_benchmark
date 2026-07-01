import { z } from "zod";
import type { RunEnvironment } from "./types/run.js";

/** The current EvalForge version (kept in sync with the root package.json). */
export const VERSION = "0.1.0";

// ── Environment configuration ─────────────────────────────────────────────────

export const logLevelSchema = z.enum(["debug", "info", "warn", "error", "silent"]);

export const envSchema = z.object({
  // Provider credentials (all optional; required only when used).
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),

  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  GOOGLE_BASE_URL: z.string().optional(),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  EVALFORGE_CONCURRENCY: z.coerce.number().int().positive().default(8),
  EVALFORGE_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  EVALFORGE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  EVALFORGE_CACHE_DIR: z.string().default(".evalforge/cache"),
  EVALFORGE_LOG_LEVEL: logLevelSchema.default("info"),
  EVALFORGE_SANDBOX: z.enum(["local", "docker", "none"]).default("local"),
  EVALFORGE_SANDBOX_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default("0.0.0.0"),
});

export type Env = z.infer<typeof envSchema>;

/** Parse and validate process env, applying defaults. Throws on invalid values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

// ── Run configuration schemas ─────────────────────────────────────────────────
// Mirror the TS types in `types/run.ts` so the API/CLI can validate untrusted
// input and produce well-typed `RunConfig` objects.

export const samplingParamsSchema = z
  .object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    stop: z.array(z.string()).optional(),
    seed: z.number().int().optional(),
    frequencyPenalty: z.number().optional(),
    presencePenalty: z.number().optional(),
    reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict();

export const modelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  params: samplingParamsSchema.optional(),
  label: z.string().optional(),
});

export const runConfigSchema = z.object({
  benchmarks: z.array(z.string()).min(1),
  models: z.array(modelConfigSchema).min(1),
  limit: z.number().int().positive().optional(),
  repeat: z.number().int().positive().max(100).optional(),
  concurrency: z.number().int().positive().max(256).optional(),
  retries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
  cache: z.boolean().optional(),
  split: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RunConfigInput = z.infer<typeof runConfigSchema>;

// ── Environment fingerprint ───────────────────────────────────────────────────

/** Capture the runtime environment for a reproducible run record. */
export function buildEnvironment(gitCommit?: string): RunEnvironment {
  return {
    evalforgeVersion: VERSION,
    nodeVersion: typeof process !== "undefined" ? process.version : "unknown",
    platform: typeof process !== "undefined" ? `${process.platform}/${process.arch}` : "unknown",
    ...(gitCommit ? { gitCommit } : {}),
    timestamp: new Date().toISOString(),
  };
}
