/** JSON value types — the lingua franca for task metadata and raw payloads. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** ISO-8601 timestamp string, e.g. `2026-07-01T10:00:00.000Z`. */
export type Timestamp = string;

/**
 * Identifier aliases. They are structurally `string` (so no runtime cost) but
 * document intent at call sites and in stored records.
 */
export type RunId = string;
export type TaskResultId = string;
export type BenchmarkId = string;
export type DatasetId = string;
export type ModelId = string;

/** A key→value bag attached to nearly every domain object for extensibility. */
export type Metadata = Record<string, JsonValue>;

/** Utility: make selected keys required. */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/** Utility: a value or a promise of it. */
export type Awaitable<T> = T | Promise<T>;
