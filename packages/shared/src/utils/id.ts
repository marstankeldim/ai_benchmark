import { randomUUID } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * A lexicographically-sortable, time-prefixed identifier (ULID-flavored).
 * The leading timestamp keeps ids roughly ordered by creation, which makes
 * database scans and log reading pleasant. Falls back to a UUID suffix for
 * uniqueness within the same millisecond.
 */
export function id(prefix?: string): string {
  const time = encodeTime(Date.now());
  const rand = randomUUID().replace(/-/g, "").slice(0, 12);
  const body = `${time}${rand}`;
  return prefix ? `${prefix}_${body}` : body;
}

function encodeTime(ms: number): string {
  let n = ms;
  let out = "";
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
}

/** A short random slug for human-facing labels (not guaranteed unique). */
export function slug(length = 8): string {
  return randomUUID().replace(/-/g, "").slice(0, length);
}
