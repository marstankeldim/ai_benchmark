/**
 * Minimal SVG primitives for self-contained charts. Reports embed these directly
 * — no browser, no chart library, no runtime — so a Markdown or HTML report is a
 * single portable file. The dashboard uses Recharts separately; this is for
 * static, emailable artifacts.
 */

/** A small, colorblind-friendly categorical palette. */
export const PALETTE = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
];

export const color = (i: number): string => PALETTE[i % PALETTE.length]!;

/** Escape text for safe inclusion in SVG/HTML. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Round to a short, stable decimal string. */
export const n = (x: number, digits = 2): string => Number(x.toFixed(digits)).toString();

export function svg(width: number, height: number, body: string, title?: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" font-family="ui-sans-serif, system-ui, sans-serif" role="img"` +
    (title ? ` aria-label="${esc(title)}">` : ">") +
    body +
    "</svg>"
  );
}

export function text(
  x: number,
  y: number,
  content: string,
  opts: { size?: number; anchor?: "start" | "middle" | "end"; fill?: string; weight?: number } = {},
): string {
  const { size = 12, anchor = "start", fill = "#334155", weight = 400 } = opts;
  return `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}" font-weight="${weight}">${esc(content)}</text>`;
}
