/**
 * Seedable pseudo-random number generator.
 *
 * Reproducibility is a first-class goal: dataset shuffling, bootstrap
 * resampling, and permutation tests all draw from a seeded stream so that a
 * run replays identically. We use mulberry32 — small, fast, and good enough
 * for statistics (not for cryptography).
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniformly pick one element (throws on empty array). */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates shuffle returning a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Sample `n` items without replacement. */
  sample<T>(items: readonly T[], n: number): T[];
}

/** Hash an arbitrary seed (string or number) into a 32-bit integer. */
export function hashSeed(seed: string | number): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: string | number = 0): Rng {
  let state = hashSeed(seed);

  const next = (): number => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(next() * (max - min + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("rng.pick: empty array");
    return items[int(0, items.length - 1)]!;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  };

  const sample = <T>(items: readonly T[], n: number): T[] =>
    shuffle(items).slice(0, Math.max(0, Math.min(n, items.length)));

  return { next, int, pick, shuffle, sample };
}
