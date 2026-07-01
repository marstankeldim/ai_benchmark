import type { BenchmarkCategory, BenchmarkTask, JsonValue, Metadata } from "@evalforge/shared";

/**
 * Configurable field mapping from an arbitrary source row to a `BenchmarkTask`.
 *
 * External datasets never agree on field names — one calls the question `prompt`,
 * another `input`, another `question`. Rather than bake in assumptions, callers
 * declare which source fields hold which task fields. Every field has a sensible
 * default (`id`, `prompt`/`input`, `expected`, `choices`) so the common case
 * needs no configuration at all.
 */
export interface FieldMapping {
  /** Source key holding the task id. Default: `id`. */
  idField?: string;
  /** Source key holding the prompt text. Default: `prompt`. */
  promptField?: string;
  /** Alias for `promptField`, checked when `promptField` is absent. Default: `input`. */
  inputField?: string;
  /** Source key holding the gold answer. Default: `expected`. */
  expectedField?: string;
  /** Source key holding multiple-choice labels. Default: `choices`. */
  choicesField?: string;
  /** Source key holding reference material for a judge. Default: `reference`. */
  referenceField?: string;
  /** Source key holding the category. Default: `category`. */
  categoryField?: string;
  /** Source key holding tags (array or comma-separated string). Default: `tags`. */
  tagsField?: string;
  /**
   * How to populate `task.metadata`:
   *  - `"rest"` (default): every source field not consumed above.
   *  - `string[]`: only these source fields.
   *  - `false`: no metadata.
   */
  metadata?: "rest" | string[] | false;
}

type Row = Record<string, unknown>;

/** Coerce a scalar-ish value to a string, or `undefined` if absent/empty. */
function asString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/** Coerce a value to a string array (accepts arrays or delimited strings). */
function asStringArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => asString(v) ?? "").filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    const parts = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return parts.length > 0 ? parts : undefined;
  }
  return undefined;
}

/** Deep-check whether a value is safe to store as `JsonValue` metadata. */
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value as JsonValue;
  if (Array.isArray(value)) {
    const arr = value.map(toJsonValue).filter((v): v is JsonValue => v !== undefined);
    return arr;
  }
  if (t === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(value as Row)) {
      const jv = toJsonValue(v);
      if (jv !== undefined) out[k] = jv;
    }
    return out;
  }
  // functions, symbols, bigint, undefined → drop.
  return undefined;
}

const KNOWN_CATEGORIES = new Set<BenchmarkCategory>([
  "coding",
  "math",
  "reasoning",
  "knowledge",
  "long-context",
  "tool-use",
  "agent",
  "safety",
  "custom",
]);

/**
 * Map one source row to a `BenchmarkTask` using `mapping` (defaults applied).
 *
 * `index` supplies a fallback id when the row has none, so a dataset without an
 * id column still yields stable, positional ids (`task-0`, `task-1`, …).
 */
export function toTask(row: Row, mapping: FieldMapping = {}, index = 0): BenchmarkTask {
  const idField = mapping.idField ?? "id";
  const promptField = mapping.promptField ?? "prompt";
  const inputField = mapping.inputField ?? "input";
  const expectedField = mapping.expectedField ?? "expected";
  const choicesField = mapping.choicesField ?? "choices";
  const referenceField = mapping.referenceField ?? "reference";
  const categoryField = mapping.categoryField ?? "category";
  const tagsField = mapping.tagsField ?? "tags";

  const id = asString(row[idField]) ?? `task-${index}`;
  const input = asString(row[promptField]) ?? asString(row[inputField]) ?? "";

  const task: BenchmarkTask = { id, input };

  const expected = asString(row[expectedField]);
  if (expected !== undefined) task.expected = expected;

  const choices = asStringArray(row[choicesField]);
  if (choices !== undefined) task.choices = choices;

  const reference = asString(row[referenceField]);
  if (reference !== undefined) task.reference = reference;

  const category = asString(row[categoryField]);
  if (category !== undefined && KNOWN_CATEGORIES.has(category as BenchmarkCategory)) {
    task.category = category as BenchmarkCategory;
  }

  const tags = asStringArray(row[tagsField]);
  if (tags !== undefined) task.tags = tags;

  const metadata = buildMetadata(row, mapping, {
    consumed: [
      idField,
      promptField,
      inputField,
      expectedField,
      choicesField,
      referenceField,
      categoryField,
      tagsField,
    ],
  });
  if (metadata && Object.keys(metadata).length > 0) task.metadata = metadata;

  return task;
}

function buildMetadata(
  row: Row,
  mapping: FieldMapping,
  ctx: { consumed: string[] },
): Metadata | undefined {
  const mode = mapping.metadata ?? "rest";
  if (mode === false) return undefined;

  const keys =
    mode === "rest"
      ? Object.keys(row).filter((k) => !ctx.consumed.includes(k))
      : mode;

  const out: Metadata = {};
  for (const key of keys) {
    if (!(key in row)) continue;
    const jv = toJsonValue(row[key]);
    if (jv !== undefined) out[key] = jv;
  }
  return out;
}

/** Map many rows, assigning positional fallback ids by array index. */
export function toTasks(rows: Row[], mapping: FieldMapping = {}): BenchmarkTask[] {
  return rows.map((row, i) => toTask(row, mapping, i));
}
