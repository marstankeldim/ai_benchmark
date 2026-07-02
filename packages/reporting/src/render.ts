/**
 * The reporting entry point: `renderReport(summary, format)` dispatches to a
 * renderer, and `writeReport` persists it with the right extension. Adding a
 * format is a new renderer file plus one case here.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ConfigError } from "@evalforge/shared";
import type { RunSummary } from "@evalforge/shared";
import { renderMarkdown } from "./renderers/markdown.js";
import { renderHtml } from "./renderers/html.js";
import { renderJson } from "./renderers/json.js";
import { renderCsv } from "./renderers/csv.js";

export type ReportFormat = "markdown" | "html" | "json" | "csv";

export const REPORT_EXTENSIONS: Record<ReportFormat, string> = {
  markdown: "md",
  html: "html",
  json: "json",
  csv: "csv",
};

/** Render a run summary to a string in the requested format. */
export function renderReport(summary: RunSummary, format: ReportFormat): string {
  switch (format) {
    case "markdown":
      return renderMarkdown(summary);
    case "html":
      return renderHtml(summary);
    case "json":
      return renderJson(summary);
    case "csv":
      return renderCsv(summary);
    default:
      throw new ConfigError(`Unknown report format "${format as string}"`);
  }
}

/** Render and write a report to disk, creating parent directories as needed. */
export async function writeReport(
  summary: RunSummary,
  format: ReportFormat,
  path: string,
): Promise<void> {
  const content = renderReport(summary, format);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
