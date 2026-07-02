/**
 * Horizontal grouped bar chart — used for overall scores, latency, and cost
 * comparisons across models. Values may carry an optional error bar (CI).
 */

import { color, esc, n, svg, text } from "./svg.js";

export interface Bar {
  label: string;
  value: number;
  /** Optional confidence interval, in the same units as `value`. */
  interval?: { low: number; high: number };
  colorIndex?: number;
}

export interface BarChartOptions {
  width?: number;
  /** Domain max. Defaults to the largest value (or 1 for a [0,1] metric). */
  max?: number;
  /** Format a value for the row label (e.g. percent, ms, $). */
  format?: (v: number) => string;
  unit?: "fraction" | "raw";
}

export function barChart(bars: Bar[], options: BarChartOptions = {}): string {
  const width = options.width ?? 460;
  const rowH = 30;
  const top = 12;
  const left = 130;
  const right = 60;
  const height = top + bars.length * rowH + 12;
  const plotW = width - left - right;
  const domainMax = options.max ?? (options.unit === "fraction" ? 1 : Math.max(1e-9, ...bars.map((b) => b.value)));
  const fmt = options.format ?? ((v: number) => n(v));

  const parts: string[] = [];
  parts.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + bars.length * rowH}" stroke="#cbd5e1"/>`);

  bars.forEach((b, i) => {
    const y = top + i * rowH;
    const c = color(b.colorIndex ?? i);
    const w = Math.max(1, (b.value / domainMax) * plotW);
    parts.push(text(left - 8, y + rowH / 2 + 4, truncate(b.label, 20), { size: 11, anchor: "end", fill: "#334155" }));
    parts.push(`<rect x="${left}" y="${y + 6}" width="${w}" height="${rowH - 14}" rx="3" fill="${c}"/>`);
    if (b.interval) {
      const x1 = left + (b.interval.low / domainMax) * plotW;
      const x2 = left + (b.interval.high / domainMax) * plotW;
      const yc = y + rowH / 2;
      parts.push(`<line x1="${x1}" y1="${yc}" x2="${x2}" y2="${yc}" stroke="#0f172a" stroke-width="1.5"/>`);
      parts.push(`<line x1="${x1}" y1="${yc - 4}" x2="${x1}" y2="${yc + 4}" stroke="#0f172a" stroke-width="1.5"/>`);
      parts.push(`<line x1="${x2}" y1="${yc - 4}" x2="${x2}" y2="${yc + 4}" stroke="#0f172a" stroke-width="1.5"/>`);
    }
    parts.push(text(left + w + 6, y + rowH / 2 + 4, fmt(b.value), { size: 11, fill: "#475569", weight: 600 }));
  });

  return svg(width, height, parts.join(""), "Bar chart");
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : esc(s);
}
