/**
 * The EvalForge REST API (Fastify). Endpoints mirror the spec:
 *
 *   POST /benchmark/run   GET /benchmarks   GET /runs   GET /runs/:id
 *   GET  /results         GET /leaderboard  POST /datasets  GET/POST /providers
 *
 * `buildServer(context)` returns a configured instance without listening, so the
 * whole surface is testable with `fastify.inject()` — no open port required.
 */

import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { runConfigSchema, VERSION, type RunConfig } from "@evalforge/shared";
import { renderReport, type ReportFormat } from "@evalforge/reporting";
import { listBenchmarks } from "@evalforge/benchmarks";
import { availableProviders } from "@evalforge/providers";
import { buildDataset, toTasks } from "@evalforge/datasets";
import { createContext, type ApiContext } from "./context.js";

const datasetSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  rows: z.array(z.record(z.unknown())).optional(),
  tasks: z.array(z.record(z.unknown())).optional(),
  mapping: z.record(z.unknown()).optional(),
});

const providerSchema = z.object({
  name: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export async function buildServer(context: ApiContext = createContext()): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", version: VERSION }));

  // ── Benchmarks ──────────────────────────────────────────────────────────────
  app.get("/benchmarks", async () => ({ benchmarks: listBenchmarks() }));

  // ── Providers ───────────────────────────────────────────────────────────────
  app.get("/providers", async () => ({
    providers: availableProviders().map((name) => ({
      name,
      configured: context.providerOverrides.has(name),
    })),
  }));

  app.post("/providers", async (request, reply) => {
    const parsed = providerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { name, ...config } = parsed.data;
    context.providerOverrides.set(name, config);
    return { registered: name };
  });

  // ── Datasets ────────────────────────────────────────────────────────────────
  app.post("/datasets", async (request, reply) => {
    const parsed = datasetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id, name, version, rows, tasks, mapping } = parsed.data;
    const sourceRows = tasks ?? rows ?? [];
    const dataset = buildDataset({
      id,
      name: name ?? id,
      ...(version ? { version } : {}),
      tasks: toTasks(sourceRows as Record<string, unknown>[], mapping ?? {}),
    });
    context.datasets.set(id, dataset);
    return { id: dataset.id, contentHash: dataset.contentHash, count: dataset.tasks.length };
  });

  app.get("/datasets", async () => ({
    datasets: [...context.datasets.values()].map((d) => ({ id: d.id, name: d.name, count: d.tasks.length, contentHash: d.contentHash })),
  }));

  // ── Runs ────────────────────────────────────────────────────────────────────
  app.post("/benchmark/run", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const parsed = runConfigSchema.safeParse(body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    // The schema validates shape; `metadata` is free-form JSON, so cast to the domain type.
    const config = parsed.data as unknown as RunConfig;
    const isAsync = (request.query as { async?: string })?.async === "true" || body.async === true;
    if (isAsync) {
      const runId = context.jobs.submitAsync(config);
      return reply.code(202).send({ runId, state: "running" });
    }
    const summary = await context.jobs.runSync(config);
    return { runId: summary.runId, summary };
  });

  app.get("/runs", async (request) => {
    const q = request.query as Record<string, string>;
    const runs = await context.store.listRuns({
      ...(q.status ? { status: q.status as never } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.benchmarkId ? { benchmarkId: q.benchmarkId } : {}),
      ...(q.limit ? { limit: Number(q.limit) } : {}),
    });
    return { runs: runs.map((r) => ({ runId: r.runId, status: r.status, createdAt: r.createdAt, config: r.config, hasSummary: Boolean(r.summary) })) };
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const run = await context.store.getRun(request.params.id);
    if (!run) return reply.code(404).send({ error: "run not found" });
    const job = context.jobs.status(request.params.id);
    return { run, ...(job ? { job } : {}) };
  });

  app.get<{ Params: { id: string } }>("/runs/:id/report", async (request, reply) => {
    const run = await context.store.getRun(request.params.id);
    if (!run?.summary) return reply.code(404).send({ error: "run or summary not found" });
    const format = ((request.query as { format?: string }).format ?? "json") as ReportFormat;
    const contentType =
      format === "html" ? "text/html" : format === "csv" ? "text/csv" : format === "markdown" ? "text/markdown" : "application/json";
    return reply.type(contentType).send(renderReport(run.summary, format));
  });

  // ── Results ─────────────────────────────────────────────────────────────────
  app.get("/results", async (request) => {
    const q = request.query as Record<string, string>;
    const results = await context.store.getResults({
      ...(q.runId ? { runId: q.runId } : {}),
      ...(q.benchmarkId ? { benchmarkId: q.benchmarkId } : {}),
      ...(q.model ? { model: q.model } : {}),
      ...(q.passed ? { passed: q.passed === "true" } : {}),
      ...(q.limit ? { limit: Number(q.limit) } : {}),
    });
    return { count: results.length, results };
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  app.get("/leaderboard", async (request) => {
    const q = request.query as Record<string, string>;
    const entries = await context.store.leaderboard({
      ...(q.dimension ? { dimension: q.dimension as never } : {}),
      ...(q.provider ? { provider: q.provider } : {}),
      ...(q.benchmarkId ? { benchmarkId: q.benchmarkId } : {}),
      ...(q.limit ? { limit: Number(q.limit) } : {}),
    });
    return { leaderboard: entries };
  });

  return app;
}
