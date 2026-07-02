/**
 * Benchmark registration. Importing this module registers every built-in
 * benchmark into the shared `benchmarkRegistry`, from which the engine resolves
 * ids. Adding a benchmark is one new file plus one line here — the engine never
 * imports a benchmark directly.
 */

import { benchmarkRegistry } from "@evalforge/shared";
import type { Benchmark } from "@evalforge/shared";
import { mmlu } from "./mmlu.js";
import { arc } from "./arc.js";
import { truthfulqa } from "./truthfulqa.js";
import { gsm8k } from "./gsm8k.js";
import { humaneval } from "./humaneval.js";
import { tooluse } from "./tooluse.js";
import { longcontext } from "./longcontext.js";

/** All built-in benchmarks, in a stable display order. */
export const BUILTIN_BENCHMARKS: Benchmark[] = [
  gsm8k,
  mmlu,
  arc,
  truthfulqa,
  humaneval,
  tooluse,
  longcontext,
];

let registered = false;

/** Idempotently register every built-in benchmark. Safe to call multiple times. */
export function registerBuiltinBenchmarks(): void {
  if (registered) return;
  for (const benchmark of BUILTIN_BENCHMARKS) {
    benchmarkRegistry.register(benchmark.id, benchmark, { overwrite: true });
  }
  registered = true;
}

/** List registered benchmarks as lightweight descriptors (for APIs/CLIs). */
export function listBenchmarks(): Array<{
  id: string;
  name: string;
  category: string;
  version: string;
  description?: string;
  metrics: string[];
}> {
  return benchmarkRegistry.list().map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category,
    version: b.version,
    ...(b.description ? { description: b.description } : {}),
    metrics: b.metrics,
  }));
}

// Register on import so `import "@evalforge/benchmarks"` is enough.
registerBuiltinBenchmarks();
