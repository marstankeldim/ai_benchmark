/** `evalforge report <runId> [--format md|html|json|csv] [--out path]` — re-render
 *  a stored run's report to stdout or a file. */

import { join } from "node:path";
import { renderReport, writeReport, type ReportFormat } from "@evalforge/reporting";
import { dim } from "../console.js";
import { str, type ParsedArgs } from "../args.js";
import { getStore } from "../store.js";

const NORMALIZE: Record<string, ReportFormat> = {
  md: "markdown",
  markdown: "markdown",
  html: "html",
  json: "json",
  csv: "csv",
};

export async function reportCommand(args: ParsedArgs): Promise<number> {
  const store = getStore();
  const runId = args._[0] ?? (await latestRunId());
  if (!runId) {
    console.error("No runs found. Run one first: evalforge run --benchmark gsm8k --model mock:balanced");
    return 1;
  }
  const stored = await store.getRun(runId);
  if (!stored?.summary) {
    console.error(`Run "${runId}" not found (or has no summary yet).`);
    return 1;
  }

  const format = NORMALIZE[str(args, "format", "report") ?? "markdown"] ?? "markdown";
  const out = str(args, "out");
  if (out) {
    const ext = format === "markdown" ? "md" : format;
    const path = out.includes(".") ? out : join(out, `report.${ext}`);
    await writeReport(stored.summary, format, path);
    console.log(dim(`Wrote ${format} report to ${path}`));
  } else {
    console.log(renderReport(stored.summary, format));
  }
  return 0;
}

async function latestRunId(): Promise<string | undefined> {
  const runs = await getStore().listRuns({ limit: 1 });
  return runs[0]?.runId;
}
