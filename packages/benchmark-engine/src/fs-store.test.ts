import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RunConfig } from "@evalforge/shared";
import { registerBuiltinBenchmarks } from "@evalforge/benchmarks";
import { createEngine } from "./runner.js";
import { FileSystemRunStore } from "./store/fs-store.js";

let dir: string;
beforeAll(async () => {
  registerBuiltinBenchmarks();
  dir = await mkdtemp(join(tmpdir(), "evalforge-fsstore-"));
});
afterAll(async () => rm(dir, { recursive: true, force: true }));

const config: RunConfig = {
  benchmarks: ["mmlu"],
  models: [{ provider: "mock", model: "mock:balanced", label: "balanced" }],
  seed: 3,
};

describe("FileSystemRunStore", () => {
  it("persists a run and its results, readable by a fresh store instance", async () => {
    const store = new FileSystemRunStore(dir);
    const summary = await createEngine({ store }).run(config, { runId: "fs_run_1" });
    expect(summary.stats.completed).toBe(10);

    // A brand-new store over the same dir sees the persisted data.
    const reopened = new FileSystemRunStore(dir);
    const stored = await reopened.getRun("fs_run_1");
    expect(stored?.summary?.byModel[0]?.overall).toBeCloseTo(summary.byModel[0]!.overall, 6);

    const results = await reopened.getResults({ runId: "fs_run_1" });
    expect(results).toHaveLength(10);

    const runs = await reopened.listRuns();
    expect(runs.some((r) => r.runId === "fs_run_1")).toBe(true);
  });

  it("resumes across store instances without re-running completed items", async () => {
    const s1 = new FileSystemRunStore(dir);
    await createEngine({ store: s1 }).run(config, { runId: "fs_run_resume" });
    const s2 = new FileSystemRunStore(dir);
    const keys = await s2.completedTaskKeys("fs_run_resume");
    expect(keys.size).toBe(10);
    const again = await createEngine({ store: s2 }).run(config, { runId: "fs_run_resume" });
    expect((await s2.getResults({ runId: "fs_run_resume" })).length).toBe(10);
    expect(again.stats.completed).toBe(10);
  });

  it("ranks a leaderboard from persisted results", async () => {
    const store = new FileSystemRunStore(dir);
    const board = await store.leaderboard({ dimension: "overall" });
    expect(board.length).toBeGreaterThan(0);
    expect(board[0]!.rank).toBe(1);
  });
});
