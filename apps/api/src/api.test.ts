import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { FileSystemRunStore } from "@evalforge/benchmark-engine";
import { createContext } from "./context.js";
import { buildServer } from "./server.js";

let app: FastifyInstance;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "evalforge-api-"));
  app = await buildServer(createContext({ store: new FileSystemRunStore(dir) }));
});
afterAll(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true }).catch(() => {});
});

const json = (res: { payload: string }): unknown => JSON.parse(res.payload);

describe("EvalForge API", () => {
  it("GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect((json(res) as { status: string }).status).toBe("ok");
  });

  it("GET /benchmarks lists the catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/benchmarks" });
    const body = json(res) as { benchmarks: { id: string }[] };
    expect(body.benchmarks.map((b) => b.id)).toContain("gsm8k");
  });

  it("GET /providers lists providers", async () => {
    const res = await app.inject({ method: "GET", url: "/providers" });
    const body = json(res) as { providers: { name: string }[] };
    expect(body.providers.map((p) => p.name)).toContain("mock");
  });

  it("POST /providers registers credentials", async () => {
    const res = await app.inject({ method: "POST", url: "/providers", payload: { name: "openai", apiKey: "sk-x" } });
    expect(res.statusCode).toBe(200);
    expect((json(res) as { registered: string }).registered).toBe("openai");
  });

  it("POST /datasets validates and hashes a custom dataset", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/datasets",
      payload: { id: "custom-1", name: "Custom", rows: [{ id: "1", prompt: "hi", expected: "yo" }] },
    });
    const body = json(res) as { id: string; contentHash: string; count: number };
    expect(body.count).toBe(1);
    expect(body.contentHash).toHaveLength(16);
  });

  it("rejects an invalid run config with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/benchmark/run", payload: { benchmarks: [] } });
    expect(res.statusCode).toBe(400);
  });

  it("POST /benchmark/run executes synchronously and returns a summary", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/benchmark/run",
      payload: {
        benchmarks: ["mmlu"],
        models: [{ provider: "mock", model: "mock:strong", label: "strong" }],
        seed: 1,
        limit: 5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = json(res) as { runId: string; summary: { byModel: { overall: number }[] } };
    expect(body.summary.byModel[0]!.overall).toBeGreaterThan(0);

    // The run is now retrievable and rankable.
    const runRes = await app.inject({ method: "GET", url: `/runs/${body.runId}` });
    expect(runRes.statusCode).toBe(200);

    const results = await app.inject({ method: "GET", url: `/results?runId=${body.runId}` });
    expect((json(results) as { count: number }).count).toBe(5);

    const board = await app.inject({ method: "GET", url: "/leaderboard?dimension=overall" });
    expect((json(board) as { leaderboard: unknown[] }).leaderboard.length).toBeGreaterThan(0);
  });

  it("GET /runs/:id/report renders markdown", async () => {
    const listed = json(await app.inject({ method: "GET", url: "/runs" })) as { runs: { runId: string }[] };
    const runId = listed.runs[0]!.runId;
    const res = await app.inject({ method: "GET", url: `/runs/${runId}/report?format=markdown` });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("# EvalForge Report");
  });

  it("supports async submission returning 202 + runId, then completes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/benchmark/run?async=true",
      payload: { benchmarks: ["mmlu"], models: [{ provider: "mock", model: "mock:balanced" }], seed: 2, limit: 3 },
    });
    expect(res.statusCode).toBe(202);
    const runId = (json(res) as { runId: string }).runId;
    expect(runId).toMatch(/^run_/);

    // Poll the job to completion so the background writes finish before teardown.
    let state = "running";
    for (let i = 0; i < 50 && state !== "completed" && state !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const status = await app.inject({ method: "GET", url: `/runs/${runId}` });
      state = ((json(status) as { job?: { state?: string } }).job?.state ?? "running") as string;
    }
    expect(state).toBe("completed");
  });
});
