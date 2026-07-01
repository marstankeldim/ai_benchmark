/**
 * Typed error hierarchy. Every error carries a stable `code` so that callers
 * (and the API layer) can branch on failure kind without string matching, and
 * a `retryable` hint the engine uses to decide whether backoff makes sense.
 */

export type ErrorCode =
  | "PROVIDER_ERROR"
  | "RATE_LIMIT"
  | "AUTH"
  | "TIMEOUT"
  | "PARSE"
  | "EVALUATION"
  | "SANDBOX"
  | "CONFIG"
  | "NOT_FOUND"
  | "UNKNOWN";

export class EvalForgeError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  override readonly cause?: unknown;
  readonly meta?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: ErrorCode;
      retryable?: boolean;
      cause?: unknown;
      meta?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? "UNKNOWN";
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.meta !== undefined) this.meta = options.meta;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** A provider returned an error status or malformed payload. */
export class ProviderError extends EvalForgeError {
  readonly provider: string;
  readonly status?: number;

  constructor(
    provider: string,
    message: string,
    options: { status?: number; retryable?: boolean; cause?: unknown; code?: ErrorCode } = {},
  ) {
    const retryable =
      options.retryable ?? (options.status ? options.status === 429 || options.status >= 500 : false);
    super(`[${provider}] ${message}`, {
      code: options.code ?? (options.status === 429 ? "RATE_LIMIT" : "PROVIDER_ERROR"),
      retryable,
      ...(options.cause !== undefined ? { cause: options.cause } : {}),
      meta: { provider, status: options.status },
    });
    this.provider = provider;
    if (options.status !== undefined) this.status = options.status;
  }
}

export class TimeoutError extends EvalForgeError {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`, { code: "TIMEOUT", retryable: true, meta: { ms } });
  }
}

export class ConfigError extends EvalForgeError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, { code: "CONFIG", ...(meta ? { meta } : {}) });
  }
}

export class NotFoundError extends EvalForgeError {
  constructor(kind: string, key: string) {
    super(`${kind} not found: ${key}`, { code: "NOT_FOUND", meta: { kind, key } });
  }
}

export class SandboxError extends EvalForgeError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super(message, { code: "SANDBOX", ...(meta ? { meta } : {}) });
  }
}

export function toEvalForgeError(error: unknown): EvalForgeError {
  if (error instanceof EvalForgeError) return error;
  if (error instanceof Error) return new EvalForgeError(error.message, { cause: error });
  return new EvalForgeError(String(error));
}
