/**
 * Seed script — populate the run store with a few deterministic evaluations so
 * the CLI (`evalforge list|leaderboard`), the API, and the dashboard have data to
 * show out of the box. Runs entirely offline against the mock provider.
 *
 *   npm run seed
 */

import { join } from "node:path";
import "@evalforge/benchmarks";
import "@evalforge/providers";
import { createEngine, FileSystemRunStore } from "@evalforge/benchmark-engine";
import { createLogger, type RunConfig } from "@evalforge/shared";

const RUNS_DIR = process.env.EVALFORGE_RUNS_DIR ?? join(process.cwd(), ".evalforge", "runs");

const MODELS = [
  { provider: "mock", model: "mock:strong", label: "mock:strong" },
  { provider: "mock", model: "mock:balanced", label: "mock:balanced" },
  { provider: "mock", model: "mock:weak", label: "mock:weak" },
];

const CONFIGS: RunConfig[] = [
  { benchmarks: ["gsm8k", "mmlu", "arc", "truthfulqa"], models: MODELS, seed: 42 },
  { benchmarks: ["humaneval"], models: MODELS, seed: 7 },
  // A second dated run of the same suite to give score-history charts two points.
  { benchmarks: ["gsm8k", "mmlu", "arc", "truthfulqa"], models: MODELS, seed: 99 },
];

async function main(): Promise<void> {
  const store = new FileSystemRunStore(RUNS_DIR);
  const engine = createEngine({ store, logger: createLogger({ scope: "seed", level: "warn" }) });

  console.log(`Seeding ${CONFIGS.length} runs into ${RUNS_DIR} …`);
  for (const [i, config] of CONFIGS.entries()) {
    const summary = await engine.run(config);
    const best = [...summary.byModel].sort((a, b) => b.overall - a.overall)[0];
    console.log(
      `  [${i + 1}/${CONFIGS.length}] ${summary.runId} — ${config.benchmarks.join(", ")} ` +
        `→ top ${best?.model.label} ${(best ? best.overall * 100 : 0).toFixed(1)}%`,
    );
  }
  console.log(`\nDone. Try:  npm run cli -- list   ·   npm run cli -- leaderboard`);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
