/**
 * A dependency-free argv parser. Supports `--flag`, `--key value`, `--key=value`,
 * and repeated keys (collected into arrays). Positional args land in `_`. Kept
 * tiny on purpose — the CLI has a handful of flags and no need for a framework.
 */

export interface ParsedArgs {
  _: string[];
  flags: Record<string, string | string[] | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const _: string[] = [];
  const flags: Record<string, string | string[] | boolean> = {};

  const set = (key: string, value: string | boolean): void => {
    const existing = flags[key];
    if (existing === undefined) flags[key] = value;
    else if (Array.isArray(existing)) existing.push(String(value));
    else flags[key] = [String(existing), String(value)];
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        set(body.slice(0, eq), body.slice(eq + 1));
      } else if (body.startsWith("no-")) {
        set(body.slice(3), false);
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        set(body, argv[++i]!);
      } else {
        set(body, true);
      }
    } else {
      _.push(token);
    }
  }

  return { _, flags };
}

/** Read a flag as a string (first value if repeated). */
export function str(args: ParsedArgs, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = args.flags[key];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v[0];
  }
  return undefined;
}

/** Read a flag as a number. */
export function num(args: ParsedArgs, ...keys: string[]): number | undefined {
  const s = str(args, ...keys);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a boolean flag (present/`--no-x`). */
export function bool(args: ParsedArgs, key: string): boolean | undefined {
  const v = args.flags[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v !== "false";
  return undefined;
}

/** Collect a repeatable/comma-separated list flag into a string[]. */
export function list(args: ParsedArgs, ...keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const v = args.flags[key];
    if (typeof v === "string") out.push(...v.split(",").map((s) => s.trim()).filter(Boolean));
    else if (Array.isArray(v)) for (const item of v) out.push(...item.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}
