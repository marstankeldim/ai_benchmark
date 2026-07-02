/** `evalforge benchmarks` and `evalforge providers` — list what's registered. */

import { availableProviders } from "@evalforge/providers";
import { listBenchmarks } from "@evalforge/benchmarks";
import { bold, dim, table } from "../console.js";

export async function benchmarksCommand(): Promise<number> {
  const benchmarks = listBenchmarks();
  console.log(bold(`\n${benchmarks.length} benchmark(s)\n`));
  console.log(
    table(
      [{ header: "ID" }, { header: "Name" }, { header: "Category" }, { header: "Metrics" }],
      benchmarks.map((b) => [b.id, b.name, b.category, b.metrics.join(", ")]),
    ),
  );
  console.log("");
  return 0;
}

export async function providersCommand(): Promise<number> {
  const providers = availableProviders();
  console.log(bold(`\n${providers.length} provider(s)\n`));
  console.log(dim("  " + providers.join("\n  ")));
  console.log("");
  return 0;
}
