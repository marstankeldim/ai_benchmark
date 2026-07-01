import { createHash } from "node:crypto";
import { canonicalize } from "./json.js";

/** SHA-256 hex digest of a string. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable hash of any JSON-serializable value (keys sorted first). */
export function hashObject(value: unknown): string {
  return sha256(canonicalize(value));
}

/**
 * The cache key for a model call. Two calls collide iff they would produce the
 * same distribution of responses: same provider, model, parameters, and prompt.
 */
export function cacheKey(parts: {
  provider: string;
  model: string;
  params: unknown;
  request: unknown;
}): string {
  return hashObject(parts).slice(0, 32);
}

/** Short, stable content hash — used to version datasets by their contents. */
export function contentHash(value: unknown): string {
  return hashObject(value).slice(0, 16);
}
