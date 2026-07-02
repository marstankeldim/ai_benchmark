import { beforeAll, describe, expect, it } from "vitest";
import { registerBuiltinBenchmarks, makeLongContextTasks } from "@evalforge/benchmarks";
import { createEngine } from "./runner.js";
import { InMemoryRunStore } from "./store/memory-store.js";

beforeAll(() => registerBuiltinBenchmarks());

describe("tool-use benchmark (offline, mock)", () => {
  it("grades native-JSON tool calls; strong beats weak; partial credit for valid JSON", async () => {
    const store = new InMemoryRunStore();
    const summary = await createEngine({ store }).run({
      benchmarks: ["tool-use"],
      models: [
        { provider: "mock", model: "mock:strong", label: "strong" },
        { provider: "mock", model: "mock:weak", label: "weak" },
      ],
      seed: 11,
    });

    const strong = summary.byModel.find((m) => m.model.label === "strong")!;
    const weak = summary.byModel.find((m) => m.model.label === "weak")!;
    expect(strong.overall).toBeGreaterThan(weak.overall);
    expect(strong.byCategory["tool-use"]).toBeGreaterThan(0.6);

    // The wrong-but-schema-valid mock answer earns exactly the 25% schema weight,
    // so every graded score is either 1.0 (right call) or 0.25 (valid JSON only).
    const results = await store.getResults({ runId: summary.runId });
    expect(results.length).toBe(12); // 6 tasks × 2 models
    for (const r of results) {
      expect([0.25, 1]).toContainEqual(r.grade.score);
    }
    expect(summary.stats.failed).toBe(0);
  });
});

describe("long-context benchmark (offline, mock)", () => {
  it("generates deterministic needle documents at the declared sizes", () => {
    const tasks = makeLongContextTasks();
    expect(tasks).toHaveLength(6); // {10k, 50k} × {0.2, 0.5, 0.8}
    const again = makeLongContextTasks();
    expect(tasks.map((t) => t.input)).toEqual(again.map((t) => t.input)); // reproducible
    const doc10k = tasks.find((t) => t.id === "lc-10k-d50")!;
    expect((doc10k.input as string).length).toBeGreaterThan(9_000 * 4);
    expect(doc10k.input as string).toContain(doc10k.expected!); // needle is present
  });

  it("runs retrieval end-to-end and tracks latency", async () => {
    const summary = await createEngine().run({
      benchmarks: ["long-context"],
      models: [{ provider: "mock", model: "mock:strong", label: "strong" }],
      seed: 5,
    });
    const strong = summary.byModel[0]!;
    expect(strong.byCategory["long-context"]).toBeGreaterThan(0.5);
    const bench = strong.byBenchmark.find((b) => b.benchmarkId === "long-context")!;
    expect(bench.metrics.retrievalAccuracy).toBe(bench.metrics.accuracy);
    expect(bench.meanLatencyMs).toBeGreaterThan(0);
    expect(summary.stats.failed).toBe(0);
  });

  it("supports custom stress sizes via the exported factory", () => {
    const [task] = makeLongContextTasks([{ tokens: 100_000, depth: 0.5 }]);
    expect(task!.id).toBe("lc-100k-d50");
    expect((task!.input as string).length).toBeGreaterThan(95_000 * 4);
  });
});
