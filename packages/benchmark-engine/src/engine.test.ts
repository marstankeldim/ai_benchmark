import { beforeAll, describe, expect, it } from "vitest";
import type { RunConfig } from "@evalforge/shared";
import { registerBuiltinBenchmarks } from "@evalforge/benchmarks";
import { createEngine } from "./runner.js";
import { InMemoryResponseCache } from "./cache/memory-cache.js";
import { InMemoryRunStore } from "./store/memory-store.js";
import { planRun, resultKey } from "./planner.js";

beforeAll(() => registerBuiltinBenchmarks());

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  benchmarks: ["gsm8k", "mmlu"],
  models: [
    { provider: "mock", model: "mock:strong", label: "strong" },
    { provider: "mock", model: "mock:weak", label: "weak" },
  ],
  seed: 7,
  ...over,
});

describe("planner", () => {
  it("expands into model × benchmark × task × repeat and skips completed", async () => {
    const plan = await planRun(config({ benchmarks: ["mmlu"], repeat: 2 }));
    // 10 mmlu tasks × 2 models × 2 repeats = 40
    expect(plan.totalTasks).toBe(40);
    expect(plan.items).toHaveLength(40);

    const completed = new Set([resultKey("mmlu", { provider: "mock", model: "mock:strong", label: "strong" }, "mmlu-1", 0)]);
    const resumed = await planRun(config({ benchmarks: ["mmlu"], repeat: 2 }), { completed });
    expect(resumed.totalTasks).toBe(40);
    expect(resumed.items).toHaveLength(39); // one skipped
  });
});

describe("engine end-to-end (mock provider, offline)", () => {
  it("runs, grades, aggregates, and ranks strong over weak", async () => {
    const engine = createEngine({ store: new InMemoryRunStore(), cache: new InMemoryResponseCache() });
    const summary = await engine.run(config());

    expect(summary.status).toBe("completed");
    expect(summary.byModel).toHaveLength(2);
    expect(summary.stats.failed).toBe(0);
    expect(summary.stats.totalTasks).toBe((8 + 10) * 2); // gsm8k(8)+mmlu(10) × 2 models

    const strong = summary.byModel.find((m) => m.model.label === "strong")!;
    const weak = summary.byModel.find((m) => m.model.label === "weak")!;
    expect(strong.overall).toBeGreaterThan(weak.overall);
    expect(strong.overall).toBeGreaterThan(0.5);

    // Every headline metric carries a confidence interval.
    for (const b of strong.byBenchmark) {
      const iv = Object.values(b.intervals)[0];
      expect(iv).toBeDefined();
      expect(iv!.low).toBeLessThanOrEqual(iv!.high);
    }

    // Cost and latency are aggregated and non-trivial.
    expect(strong.totalCostUsd).toBeGreaterThan(0);
    expect(strong.meanLatencyMs).toBeGreaterThan(0);
    expect(strong.totalTokens).toBeGreaterThan(0);
  });

  it("produces pairwise significance tests with a positive delta for strong−weak", async () => {
    const engine = createEngine();
    const summary = await engine.run(config());
    const overall = summary.comparisons.find(
      (c) => c.benchmarkId === undefined && c.modelA === "strong" && c.modelB === "weak",
    );
    expect(overall).toBeDefined();
    expect(overall!.test.delta).toBeGreaterThan(0);
    expect(overall!.test.interval).toBeDefined();
    expect(typeof overall!.test.pValue).toBe("number");
  });

  it("is reproducible: same seed ⇒ identical overall scores", async () => {
    const a = await createEngine().run(config());
    const b = await createEngine().run(config());
    const scoreA = a.byModel.map((m) => m.overall).sort();
    const scoreB = b.byModel.map((m) => m.overall).sort();
    expect(scoreA).toEqual(scoreB);
  });

  it("serves repeated runs from cache (no re-generation)", async () => {
    const cache = new InMemoryResponseCache();
    const store = new InMemoryRunStore();
    const engine = createEngine({ store, cache });
    await engine.run(config({ benchmarks: ["mmlu"], models: [{ provider: "mock", model: "mock:balanced" }] }));
    const sizeAfterFirst = cache.size;
    expect(sizeAfterFirst).toBeGreaterThan(0);

    // A second, fresh run with the same requests should hit the cache for all items.
    const store2 = new InMemoryRunStore();
    const summary = await createEngine({ store: store2, cache }).run(
      config({ benchmarks: ["mmlu"], models: [{ provider: "mock", model: "mock:balanced" }] }),
    );
    const results = await store2.getResults({ runId: summary.runId });
    expect(results.every((r) => r.cached)).toBe(true);
  });

  it("resumes an interrupted run, reusing prior results", async () => {
    const store = new InMemoryRunStore();
    const engine = createEngine({ store });
    const cfg = config({ benchmarks: ["mmlu"], models: [{ provider: "mock", model: "mock:balanced" }] });

    // First pass with a runId.
    const first = await engine.run(cfg, { runId: "run_resume_test" });
    const firstCount = (await store.getResults({ runId: "run_resume_test" })).length;
    expect(firstCount).toBe(10);

    // Second pass with the same runId: everything is already completed → 10 total, no growth.
    const second = await engine.run(cfg, { runId: "run_resume_test" });
    const secondCount = (await store.getResults({ runId: "run_resume_test" })).length;
    expect(secondCount).toBe(10);
    expect(second.stats.completed).toBe(10);
  });

  it("supports leaderboard ranking over stored results", async () => {
    const store = new InMemoryRunStore();
    await createEngine({ store }).run(config());
    const board = await store.leaderboard({ dimension: "overall" });
    expect(board.length).toBe(2);
    expect(board[0]!.rank).toBe(1);
    expect(board[0]!.score).toBeGreaterThanOrEqual(board[1]!.score);
  });
});
