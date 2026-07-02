/**
 * In-memory {@link ResponseCache}. Keys are content hashes of the full request,
 * so a cache hit is a *replay*: re-grading or re-reporting a run needs no provider
 * calls. This backend lives only for the process lifetime; use the filesystem
 * cache to persist across runs.
 */

import type { ModelResponse, ResponseCache } from "@evalforge/shared";

export class InMemoryResponseCache implements ResponseCache {
  private readonly store = new Map<string, ModelResponse>();

  async get(key: string): Promise<ModelResponse | null> {
    const hit = this.store.get(key);
    return hit ? { ...hit, cached: true } : null;
  }

  async set(key: string, value: ModelResponse): Promise<void> {
    this.store.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** A cache that never hits — used to force fresh provider calls. */
export class NoopResponseCache implements ResponseCache {
  async get(): Promise<ModelResponse | null> {
    return null;
  }
  async set(): Promise<void> {}
}
