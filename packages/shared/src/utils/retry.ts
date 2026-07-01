import { TimeoutError } from "../errors.js";

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  retries?: number;
  /** Base delay in ms for exponential backoff. Default 500. */
  baseDelayMs?: number;
  /** Backoff multiplier. Default 2. */
  factor?: number;
  /** Max delay cap in ms. Default 30_000. */
  maxDelayMs?: number;
  /** Add jitter (±50%) to spread retries. Default true. */
  jitter?: boolean;
  /** Decide whether a given error is retryable. Default: everything. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Observe each retry (for logging / metrics). */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/** Run `fn` with exponential backoff on failure. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    factor = 2,
    maxDelayMs = 30_000,
    jitter = true,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error, attempt)) break;
      const raw = Math.min(maxDelayMs, baseDelayMs * factor ** (attempt - 1));
      const delay = jitter ? raw * (0.5 + Math.random()) : raw;
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Reject with a `TimeoutError` if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
