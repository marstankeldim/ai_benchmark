/**
 * Radar (spider) chart — the canonical way to show a model's per-category profile
 * and to compare several models at a glance. Values are in [0, 1].
 */

import { color, esc, svg, text } from "./svg.js";

export interface RadarSeries {
  label: string;
  values: number[];
}

export function radarChart(axes: string[], series: RadarSeries[], size = 360): string {
  const cx = size / 2;
  const cy = size / 2 + 6;
  const radius = size / 2 - 60;
  const count = axes.length;
  if (count < 3) return svg(size, 80, text(10, 40, "Radar needs ≥3 categories", { fill: "#94a3b8" }));

  const angleFor = (i: number): number => (Math.PI * 2 * i) / count - Math.PI / 2;
  const point = (i: number, r: number): [number, number] => [
    cx + Math.cos(angleFor(i)) * r,
    cy + Math.sin(angleFor(i)) * r,
  ];

  const parts: string[] = [];

  // Concentric grid rings + spokes.
  for (const level of [0.25, 0.5, 0.75, 1]) {
    const ring = Array.from({ length: count }, (_, i) => point(i, radius * level).join(",")).join(" ");
    parts.push(`<polygon points="${ring}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`);
  }
  for (let i = 0; i < count; i++) {
    const [x, y] = point(i, radius);
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`);
    const [lx, ly] = point(i, radius + 18);
    const anchor = Math.abs(lx - cx) < 8 ? "middle" : lx < cx ? "end" : "start";
    parts.push(text(lx, ly + 4, axes[i]!, { size: 11, anchor, fill: "#475569" }));
  }

  // One polygon per model.
  series.forEach((s, si) => {
    const c = color(si);
    const poly = s.values.map((v, i) => point(i, radius * clamp01(v)).join(",")).join(" ");
    parts.push(`<polygon points="${poly}" fill="${c}" fill-opacity="0.12" stroke="${c}" stroke-width="2"/>`);
    s.values.forEach((v, i) => {
      const [x, y] = point(i, radius * clamp01(v));
      parts.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="${c}"/>`);
    });
  });

  // Legend.
  series.forEach((s, si) => {
    const ly = 16 + si * 16;
    parts.push(`<rect x="12" y="${ly - 9}" width="10" height="10" rx="2" fill="${color(si)}"/>`);
    parts.push(text(28, ly, esc(s.label), { size: 11, fill: "#334155" }));
  });

  return svg(size, size + 20, parts.join(""), "Per-category radar chart");
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
