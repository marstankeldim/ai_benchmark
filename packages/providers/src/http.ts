/**
 * A tiny HTTP layer shared by every provider. It does exactly three things:
 * enforce a timeout (via `AbortController`, honoring any caller-supplied signal),
 * POST/GET JSON, and map non-2xx responses onto the typed {@link ProviderError}
 * (with a correct `retryable` hint for 429/5xx). Run-level retry and backoff live
 * in the engine — providers only speak one request at a time.
 */

import { ProviderError } from "@evalforge/shared";
import type { CallOptions, ProviderName } from "@evalforge/shared";

/** Wall-clock timer around a fetch, so we can report `latencyMs` accurately. */
export interface Timed<T> {
  data: T;
  latencyMs: number;
}

export interface RequestContext extends CallOptions {
  /** Extra headers merged over the provider defaults. */
  headers?: Record<string, string>;
  /** Default timeout if `options.timeoutMs` is not set. */
  defaultTimeoutMs?: number;
}

/** Combine a caller signal with a timeout into a single AbortSignal + cleanup. */
function withDeadline(
  timeoutMs: number | undefined,
  external?: AbortSignal,
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if ((!timeoutMs || timeoutMs <= 0) && !external) return { signal: undefined, cleanup: () => {} };
  const controller = new AbortController();
  const onAbort = (): void => controller.abort((external as AbortSignal | undefined)?.reason);
  if (external) {
    if (external.aborted) controller.abort(external.reason);
    else external.addEventListener("abort", onAbort, { once: true });
  }
  const timer =
    timeoutMs && timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)), timeoutMs)
      : undefined;
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    },
  };
}

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function request<T>(
  method: "POST" | "GET",
  url: string,
  provider: ProviderName,
  body: unknown,
  ctx: RequestContext = {},
): Promise<Timed<T>> {
  const { signal, cleanup } = withDeadline(ctx.timeoutMs ?? ctx.defaultTimeoutMs, ctx.signal);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...ctx.headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderError(String(provider), `HTTP ${res.status} ${truncate(text)}`, {
        status: res.status,
      });
    }
    const data = (await res.json()) as T;
    return { data, latencyMs };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(String(provider), error.message || "request aborted", {
        status: 408,
        retryable: true,
        cause: error,
      });
    }
    // Network-level failure (DNS, connection reset) — worth a retry.
    throw new ProviderError(String(provider), (error as Error).message ?? "network error", {
      retryable: true,
      cause: error,
    });
  } finally {
    cleanup();
  }
}

/** POST a JSON body and parse a JSON response, timing the round trip. */
export function postJson<T>(
  url: string,
  provider: ProviderName,
  body: unknown,
  ctx?: RequestContext,
): Promise<Timed<T>> {
  return request<T>("POST", url, provider, body, ctx);
}

/** GET and parse a JSON response, timing the round trip. */
export function getJson<T>(url: string, provider: ProviderName, ctx?: RequestContext): Promise<Timed<T>> {
  return request<T>("GET", url, provider, undefined, ctx);
}
