/**
 * @evalforge/datasets — turn external data into canonical `BenchmarkTask`s.
 *
 * Three concerns, cleanly separated:
 *  - **parse** — format-level string→rows parsers (RFC-4180 CSV, JSONL).
 *  - **mapping** — configurable row→`BenchmarkTask` field mapping.
 *  - **loaders** — JSON / JSONL / CSV / file / HuggingFace entry points, plus
 *    `buildDataset` (content-hashed) and `applyLoadOptions` (seeded sampling).
 */

export * from "./parse/index.js";
export * from "./mapping.js";
export * from "./loaders.js";
export * from "./dataset.js";
