/** Presentation helpers shared by all renderers. Keep formatting in one place so
 *  Markdown, HTML, and CSV agree on how a percent, a dollar, and a millisecond
 *  look. */

export const pct = (x: number, digits = 1): string => `${(x * 100).toFixed(digits)}%`;

export const usd = (x: number): string => {
  if (x === 0) return "$0";
  if (x < 0.01) return `$${x.toFixed(5)}`;
  return `$${x.toFixed(x < 1 ? 4 : 2)}`;
};

export const ms = (x: number): string => (x >= 1000 ? `${(x / 1000).toFixed(2)}s` : `${Math.round(x)}ms`);

export const int = (x: number): string => Math.round(x).toLocaleString("en-US");

/** Render a confidence interval like "72.0% (68.1–75.4%)". */
export function withInterval(
  value: number,
  interval: { low: number; high: number } | undefined,
  fmt: (x: number) => string,
): string {
  if (!interval) return fmt(value);
  return `${fmt(value)} (${fmt(interval.low)}–${fmt(interval.high)})`;
}
