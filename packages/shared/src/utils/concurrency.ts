/**
 * Bounded-concurrency helpers. The engine's "sequential vs parallel execution"
 * is nothing more than `mapWithConcurrency` with a limit of 1 vs N.
 */

export interface ConcurrencyOptions {
  /** Max in-flight tasks. `1` = sequential. Default 8. */
  concurrency?: number;
  /** Called after each task settles — useful for progress bars. */
  onProgress?: (completed: number, total: number) => void;
  /** Abort remaining work early. */
  signal?: AbortSignal;
}

/**
 * Map over `items` with a fixed worker pool, preserving input order in the
 * output. Each worker pulls the next index until the queue drains. Errors from
 * `fn` reject the whole call (wrap in `Result` if you want per-item failures).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ConcurrencyOptions = {},
): Promise<R[]> {
  const { concurrency = 8, onProgress, signal } = options;
  const total = items.length;
  const results = new Array<R>(total);
  let nextIndex = 0;
  let completed = 0;

  const workerCount = Math.max(1, Math.min(concurrency, total));

  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const index = nextIndex++;
      if (index >= total) return;
      results[index] = await fn(items[index]!, index);
      completed++;
      onProgress?.(completed, total);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** A classic counting semaphore for guarding a shared resource. */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.available = Math.max(1, permits);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return () => this.release();
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.available--;
    return () => this.release();
  }

  private release(): void {
    this.available++;
    const next = this.waiters.shift();
    if (next) next();
  }

  /** Run `fn` while holding a permit. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
