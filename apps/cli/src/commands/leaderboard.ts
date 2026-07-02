/**
 * `evalforge leaderboard [--dimension overall|coding|math|reasoning|latency|cost]`
 * — rank models across all stored runs, computed from persisted task results by
 * the store's shared `computeLeaderboard`.
 */

import type { LeaderboardQuery } from "@evalforge/shared";
import { pct } from "@evalforge/reporting";
import { bold, dim, green, table } from "../console.js";
import { str, type ParsedArgs } from "../args.js";
import { getStore } from "../store.js";

export async function leaderboardCommand(args: ParsedArgs): Promise<number> {
  const dimension = (str(args, "dimension", "dim") ?? "overall") as NonNullable<LeaderboardQuery["dimension"]>;
  const provider = str(args, "provider");
  const benchmarkId = str(args, "benchmark");

  const entries = await getStore().leaderboard({
    dimension,
    ...(provider ? { provider } : {}),
    ...(benchmarkId ? { benchmarkId } : {}),
  });

  if (entries.length === 0) {
    console.log(dim("No runs to rank yet."));
    return 0;
  }

  console.log(bold(`\nLeaderboard — ${dimension}\n`));
  console.log(
    table(
      [
        { header: "#", align: "right" },
        { header: "Model" },
        { header: "Provider" },
        { header: "Score", align: "right" },
        { header: "Samples", align: "right" },
        { header: "Runs", align: "right" },
      ],
      entries.map((e) => [
        String(e.rank),
        e.model,
        e.provider,
        green(formatScore(e.score, dimension)),
        String(e.samples),
        String(e.runs),
      ]),
    ),
  );
  console.log("");
  return 0;
}

function formatScore(score: number, dimension: string): string {
  if (dimension === "latency") return `${Math.round(score)}ms`;
  if (dimension === "cost") return `$${score.toFixed(4)}`;
  return pct(score);
}
