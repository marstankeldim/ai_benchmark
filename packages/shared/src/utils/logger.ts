/** Minimal structured logger with levels and child scoping. */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Derive a logger that prefixes every line with `scope`. */
  child(scope: string): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  scope?: string;
  /** Sink for formatted lines. Defaults to the console. */
  sink?: (level: LogLevel, line: string, meta?: Record<string, unknown>) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const scope = options.scope ?? "";
  const threshold = LEVEL_WEIGHT[level];

  const sink =
    options.sink ??
    ((lvl, line, meta) => {
      const method = lvl === "debug" ? "log" : lvl;
      const args = meta && Object.keys(meta).length > 0 ? [line, meta] : [line];
      // eslint-disable-next-line no-console
      (console[method as "log" | "info" | "warn" | "error"] ?? console.log)(...args);
    });

  const log = (lvl: LogLevel, message: string, meta?: Record<string, unknown>): void => {
    if (LEVEL_WEIGHT[lvl] < threshold) return;
    const prefix = scope ? `[${scope}] ` : "";
    sink(lvl, `${prefix}${message}`, meta);
  };

  return {
    debug: (m, meta) => log("debug", m, meta),
    info: (m, meta) => log("info", m, meta),
    warn: (m, meta) => log("warn", m, meta),
    error: (m, meta) => log("error", m, meta),
    child: (childScope) =>
      createLogger({
        level,
        scope: scope ? `${scope}:${childScope}` : childScope,
        ...(options.sink ? { sink: options.sink } : {}),
      }),
  };
}

/** A logger that swallows everything — handy in tests. */
export const nullLogger: Logger = createLogger({ level: "silent" });
