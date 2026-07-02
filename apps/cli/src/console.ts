/**
 * Terminal presentation helpers: a fixed-width table printer and a few ANSI
 * accents (auto-disabled when stdout is not a TTY or `NO_COLOR` is set).
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string, s: string): string => (useColor ? `[${code}m${s}[0m` : s);

export const bold = (s: string): string => wrap("1", s);
export const dim = (s: string): string => wrap("2", s);
export const green = (s: string): string => wrap("32", s);
export const cyan = (s: string): string => wrap("36", s);
export const yellow = (s: string): string => wrap("33", s);
export const red = (s: string): string => wrap("31", s);

export type Align = "left" | "right";

export interface Column {
  header: string;
  align?: Align;
}

/** Render a simple bordered table. Cell strings may contain ANSI codes. */
export function table(columns: Column[], rows: string[][]): string {
  const widths = columns.map((c, i) =>
    Math.max(visibleLength(c.header), ...rows.map((r) => visibleLength(r[i] ?? ""))),
  );
  const pad = (s: string, w: number, align: Align): string => {
    const gap = w - visibleLength(s);
    return align === "right" ? " ".repeat(Math.max(0, gap)) + s : s + " ".repeat(Math.max(0, gap));
  };
  const line = (cells: string[]): string =>
    cells.map((c, i) => pad(c, widths[i]!, columns[i]!.align ?? "left")).join("  ");

  const out: string[] = [];
  out.push(line(columns.map((c) => bold(c.header))));
  out.push(dim(widths.map((w) => "─".repeat(w)).join("  ")));
  for (const r of rows) out.push(line(r));
  return out.join("\n");
}

/** Length of a string ignoring ANSI escape codes. */
function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "").length;
}

/** A single-line, in-place progress bar writer. */
export function progressBar(completed: number, total: number, width = 24): string {
  const ratio = total > 0 ? completed / total : 0;
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${completed}/${total}`;
}
