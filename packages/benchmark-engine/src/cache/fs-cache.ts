/**
 * Filesystem {@link ResponseCache}. Each response is a JSON file named by its
 * content-hash key, sharded into 256 subdirectories to keep directories small.
 * Survives across process runs, so an interrupted-then-resumed run (or a re-grade)
 * reuses prior model calls for free. Reads are lazily memoized in-process.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ModelResponse, ResponseCache } from "@evalforge/shared";
import { safeJsonParse } from "@evalforge/shared";

export class FileSystemResponseCache implements ResponseCache {
  private readonly memo = new Map<string, ModelResponse>();

  constructor(private readonly dir: string) {}

  private pathFor(key: string): string {
    const shard = key.slice(0, 2);
    return join(this.dir, shard, `${key}.json`);
  }

  async get(key: string): Promise<ModelResponse | null> {
    const memoized = this.memo.get(key);
    if (memoized) return { ...memoized, cached: true };
    try {
      const text = await readFile(this.pathFor(key), "utf8");
      const value = safeJsonParse<ModelResponse>(text);
      if (!value) return null;
      this.memo.set(key, value);
      return { ...value, cached: true };
    } catch {
      return null;
    }
  }

  async set(key: string, value: ModelResponse): Promise<void> {
    this.memo.set(key, value);
    const path = this.pathFor(key);
    await mkdir(join(this.dir, key.slice(0, 2)), { recursive: true });
    await writeFile(path, JSON.stringify(value), "utf8");
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
