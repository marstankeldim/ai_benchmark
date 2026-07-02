#!/usr/bin/env node
/**
 * EvalForge CLI entry point. Importing `@evalforge/benchmarks` and
 * `@evalforge/providers` registers all built-ins as a side effect, so every
 * command sees the full catalog. Dispatch is a simple command switch.
 *
 *   evalforge run  --benchmark gsm8k,mmlu --model mock:strong --model mock:weak
 *   evalforge list
 *   evalforge report <runId> --format html --out ./out
 *   evalforge benchmarks | providers | leaderboard
 */

import "@evalforge/benchmarks"; // registers benchmarks
import "@evalforge/providers"; // registers providers
import { EvalForgeError } from "@evalforge/shared";
import { parseArgs } from "./args.js";
import { bold, dim, red } from "./console.js";
import { runCommand } from "./commands/run.js";
import { listCommand } from "./commands/list.js";
import { reportCommand } from "./commands/report.js";
import { benchmarksCommand, providersCommand } from "./commands/catalog.js";
import { leaderboardCommand } from "./commands/leaderboard.js";

const HELP = `${bold("EvalForge")} — reproducible LLM benchmarking

${bold("Usage")}
  evalforge <command> [options]

${bold("Commands")}
  run           Run benchmarks against one or more models
  list          List stored runs
  report <id>   Render a stored run's report (markdown|html|json|csv)
  benchmarks    List available benchmarks
  providers     List available model providers
  leaderboard   Rank models across all stored runs

${bold("run options")}
  --benchmark <ids>     Comma-separated or repeated (default: gsm8k)
  --all                 Run every registered benchmark
  --model <spec>        provider:model, repeatable (default: mock:balanced)
  --limit <n>           Cap tasks per benchmark
  --repeat <n>          Samples per task (enables pass@k)
  --concurrency <n>     Max parallel calls (default: 8)
  --seed <n>            Master seed for reproducibility (default: 42)
  --temperature <t>     Sampling temperature
  --no-cache            Disable the response cache
  --report <fmts>       Report formats to write (markdown,html,json,csv)
  --out <dir>           Output directory for reports
  --print               Also print the first report to stdout

${bold("Examples")}
  ${dim("# Fully offline, deterministic demo")}
  evalforge run --benchmark gsm8k,mmlu --model mock:strong --model mock:weak
  evalforge run --all --model mock:balanced --limit 5 --report html --print
  evalforge leaderboard --dimension overall
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  if (!command || command === "help" || args.flags.help) {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "run":
      return runCommand(args);
    case "list":
      return listCommand();
    case "report":
      return reportCommand(args);
    case "benchmarks":
    case "bench":
      return benchmarksCommand();
    case "providers":
      return providersCommand();
    case "leaderboard":
    case "board":
      return leaderboardCommand(args);
    default:
      console.error(red(`Unknown command "${command}".`));
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    if (error instanceof EvalForgeError) {
      console.error(red(`\n✗ ${error.code}: ${error.message}`));
    } else {
      console.error(red(`\n✗ ${(error as Error).message}`));
      if (process.env.EVALFORGE_DEBUG) console.error(error);
    }
    process.exit(1);
  });
