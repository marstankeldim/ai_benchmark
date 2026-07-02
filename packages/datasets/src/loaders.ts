/**
 * Dataset loaders. Each turns an external representation into `BenchmarkTask[]`
 * via the shared {@link FieldMapping}. Loaders operate on in-memory *text* so
 * they are pure and testable; `loadTasksFromFile` adds filesystem dispatch on
 * top, and `loadHuggingFace` fetches from the HF datasets-server.
 *
 * Supported formats: JSON (array, or `{tasks|data|rows: [...]}`), JSONL, CSV,
 * and HuggingFace. Adding a new format is a new function here — no caller changes.
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ConfigError } from "@evalforge/shared";
import type { BenchmarkTask } from "@evalforge/shared";
import { parseCsv, toRecords } from "./parse/csv.js";
import { parseJsonl } from "./parse/jsonl.js";
import { toTasks, type FieldMapping } from "./mapping.js";

type Row = Record<string, unknown>;

export type DatasetFormat = "json" | "jsonl" | "csv";

export interface LoadTextOptions {
  mapping?: FieldMapping;
}

/** Pull the row array out of the several shapes a JSON dataset file can take. */
function rowsFromJson(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["tasks", "data", "rows", "examples", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as Row[];
    }
  }
  throw new ConfigError("loadJsonTasks: expected a JSON array or an object with a tasks/data/rows array");
}

/** Load tasks from a JSON string (array or wrapped object). */
export function loadJsonTasks(text: string, options: LoadTextOptions = {}): BenchmarkTask[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new ConfigError("loadJsonTasks: invalid JSON", { cause: String(cause) });
  }
  return toTasks(rowsFromJson(data), options.mapping);
}

/** Load tasks from JSON Lines text (one JSON object per line). */
export function loadJsonlTasks(text: string, options: LoadTextOptions = {}): BenchmarkTask[] {
  return toTasks(parseJsonl(text) as Row[], options.mapping);
}

/** Load tasks from CSV text (first row is the header). */
export function loadCsvTasks(text: string, options: LoadTextOptions = {}): BenchmarkTask[] {
  return toTasks(toRecords(parseCsv(text)) as unknown as Row[], options.mapping);
}

/** Parse dataset text in a known format. */
export function loadTasksFromText(
  text: string,
  format: DatasetFormat,
  options: LoadTextOptions = {},
): BenchmarkTask[] {
  switch (format) {
    case "json":
      return loadJsonTasks(text, options);
    case "jsonl":
      return loadJsonlTasks(text, options);
    case "csv":
      return loadCsvTasks(text, options);
    default:
      throw new ConfigError(`loadTasksFromText: unknown format "${format as string}"`);
  }
}

/** Infer a format from a file extension. */
export function formatFromPath(path: string): DatasetFormat {
  const ext = extname(path).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".jsonl" || ext === ".ndjson") return "jsonl";
  if (ext === ".csv" || ext === ".tsv") return "csv";
  throw new ConfigError(`Unsupported dataset extension "${ext}" for ${path}`);
}

export interface LoadFileOptions extends LoadTextOptions {
  format?: DatasetFormat;
}

/** Read and parse a dataset file, inferring the format from its extension. */
export async function loadTasksFromFile(
  path: string,
  options: LoadFileOptions = {},
): Promise<BenchmarkTask[]> {
  const text = await readFile(path, "utf8");
  const format = options.format ?? formatFromPath(path);
  return loadTasksFromText(text, format, options);
}

// ── HuggingFace datasets-server ───────────────────────────────────────────────

export interface HuggingFaceOptions extends LoadTextOptions {
  dataset: string;
  config?: string;
  split?: string;
  /** Max rows to fetch (paginated in blocks of 100). Default 100. */
  limit?: number;
  offset?: number;
  /** Injectable fetch for testing; defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

interface HfRowsResponse {
  rows?: Array<{ row?: Row }>;
}

/**
 * Load rows from the public HuggingFace datasets-server `/rows` API and map them
 * to tasks. Paginates in blocks of 100 (the API's per-request cap) up to `limit`.
 */
export async function loadHuggingFace(options: HuggingFaceOptions): Promise<BenchmarkTask[]> {
  const {
    dataset,
    config = "default",
    split = "test",
    limit = 100,
    offset = 0,
    fetchImpl = fetch,
    baseUrl = "https://datasets-server.huggingface.co",
  } = options;

  const rows: Row[] = [];
  const pageSize = 100;
  for (let fetched = 0; fetched < limit; fetched += pageSize) {
    const length = Math.min(pageSize, limit - fetched);
    const url =
      `${baseUrl}/rows?dataset=${encodeURIComponent(dataset)}` +
      `&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}` +
      `&offset=${offset + fetched}&length=${length}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new ConfigError(`loadHuggingFace: ${dataset} returned HTTP ${res.status}`, {
        status: res.status,
      });
    }
    const body = (await res.json()) as HfRowsResponse;
    const batch = body.rows ?? [];
    for (const r of batch) if (r.row) rows.push(r.row);
    if (batch.length < length) break; // reached the end of the split
  }

  return toTasks(rows, options.mapping);
}
