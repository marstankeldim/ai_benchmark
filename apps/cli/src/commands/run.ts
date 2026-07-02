/**
 * `evalforge run` — plan and execute an evaluation, print a live progress bar and
 * a results table, then write reports and persist the summary. Works fully
 * offline against the mock provider; the same command drives real providers when
 * API keys are present in the environment.
 */

import { join } from "node:path";
import { createEngine, FileSystemResponseCache, InMemoryResponseCache } from "@evalforge/benchmark-engine";
import { renderReport, writeReport, type ReportFormat, headline, pct, recommendations } from "@evalforge/reporting";
import { createLogger, loadEnv, type ProgressEvent, type RunConfig, type SamplingParams } from "@evalforge/shared";
import { listBenchmarks } from "@evalforge/benchmarks";
import { bold, cyan, dim, green, progressBar, table } from "../console.js";
import { parseModelSpec } from "../models.js";
import { bool, list, num, type ParsedArgs } from "../args.js";
import { getStore } from "../store.js";

const REPORT_FORMATS: ReportFormat[] = ["markdown", "html", "json", "csv"];

export async function runCommand(args: ParsedArgs): Promise<number> {
  const benchmarkIds = resolveBenchmarks(args);
  const modelSpecs = list(args, "model", "models");
  if (modelSpecs.length === 0) modelSpecs.push("mock:balanced");

  const params: SamplingParams = {};
  const temperature = num(args, "temperature", "temp");
  if (temperature !== undefined) params.temperature = temperature;
  const maxTokens = num(args, "max-tokens");
  if (maxTokens !== undefined) params.maxTokens = maxTokens;

  const config: RunConfig = {
    benchmarks: benchmarkIds,
    models: modelSpecs.map((s) => parseModelSpec(s, params)),
    ...(num(args, "limit") !== undefined ? { limit: num(args, "limit") } : {}),
    ...(num(args, "repeat") !== undefined ? { repeat: num(args, "repeat") } : {}),
    ...(num(args, "concurrency") !== undefined ? { concurrency: num(args, "concurrency") } : {}),
    ...(num(args, "seed") !== undefined ? { seed: num(args, "seed") } : { seed: 42 }),
    cache: bool(args, "cache") ?? true,
  };

  const env = loadEnv();
  const cache =
    config.cache === false
      ? new InMemoryResponseCache()
      : new FileSystemResponseCache(join(env.EVALFORGE_CACHE_DIR, "responses"));
  const verbose = bool(args, "verbose") ?? false;
  const engine = createEngine({
    store: getStore(),
    cache,
    gitCommit: process.env.GIT_COMMIT ?? undefined,
    logger: createLogger({ scope: "engine", level: verbose ? "info" : "warn" }),
  });

  console.log(bold("\n⚒  EvalForge"));
  console.log(
    dim(`   benchmarks: ${benchmarkIds.join(", ")}\n   models: ${modelSpecs.join(", ")}\n`),
  );

  let lastLine = "";
  const onProgress = (event: ProgressEvent): void => {
    if (event.type === "task:done") {
      lastLine = `   ${progressBar(event.completed, event.total)}`;
      if (process.stdout.isTTY) process.stdout.write(`\r${lastLine}`);
    } else if (event.type === "run:start") {
      process.stdout.write(`   ${progressBar(0, event.totalTasks)}`);
    }
  };

  const summary = await engine.run(config, { onProgress });
  if (process.stdout.isTTY) process.stdout.write("\n");

  // Results table.
  console.log("");
  console.log(bold("Results"));
  const ranked = [...summary.byModel].sort((a, b) => b.overall - a.overall);
  console.log(
    table(
      [
        { header: "Model" },
        { header: "Overall", align: "right" },
        { header: "Latency", align: "right" },
        { header: "Cost", align: "right" },
        { header: "Tokens", align: "right" },
      ],
      ranked.map((m) => [
        m.model.label ?? `${m.model.provider}:${m.model.model}`,
        green(pct(m.overall)),
        `${Math.round(m.meanLatencyMs)}ms`,
        `$${m.totalCostUsd.toFixed(4)}`,
        String(m.totalTokens),
      ]),
    ),
  );
  console.log("");
  console.log(cyan("→ ") + headline(summary));
  for (const r of recommendations(summary).slice(0, 3)) console.log(dim("  • " + stripBold(r)));

  // The engine already persisted the run to the store; now write reports.
  const formats = resolveFormats(args);
  const outDir = (args.flags.out as string) ?? join(".evalforge", "reports", summary.runId);
  const written: string[] = [];
  for (const format of formats) {
    const ext = format === "markdown" ? "md" : format;
    const path = join(outDir, `report.${ext}`);
    await writeReport(summary, format, path);
    written.push(path);
  }
  console.log("");
  console.log(dim(`Saved run ${summary.runId}. Reports: ${written.join(", ")}`));

  // If a single format was requested via --print, echo it.
  if (bool(args, "print")) console.log("\n" + renderReport(summary, formats[0] ?? "markdown"));

  return summary.stats.failed > 0 ? 1 : 0;
}

function resolveBenchmarks(args: ParsedArgs): string[] {
  if (bool(args, "all")) return listBenchmarks().map((b) => b.id);
  const ids = list(args, "benchmark", "benchmarks");
  return ids.length > 0 ? ids : ["gsm8k"];
}

function resolveFormats(args: ParsedArgs): ReportFormat[] {
  const requested = list(args, "report", "format");
  if (requested.length === 0) return ["markdown", "html", "json"];
  const normalize: Record<string, ReportFormat> = {
    md: "markdown",
    markdown: "markdown",
    html: "html",
    json: "json",
    csv: "csv",
  };
  const out = requested.map((f) => normalize[f]).filter((f): f is ReportFormat => Boolean(f));
  return out.length > 0 ? out : REPORT_FORMATS;
}

const stripBold = (s: string): string => s.replace(/\*\*/g, "");
