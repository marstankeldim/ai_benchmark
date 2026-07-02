/**
 * Text and number normalization shared by the deterministic judges. Grading is
 * only as fair as its normalization: "  4.0 " and "4" should match a numeric gold
 * answer, and "Paris." should match "paris" under case-insensitive comparison.
 */

export interface NormalizeOptions {
  caseSensitive?: boolean;
  trim?: boolean;
  /** Strip punctuation and collapse internal whitespace. */
  normalize?: boolean;
}

/** Apply the configured normalization to a string. */
export function normalizeText(text: string, options: NormalizeOptions = {}): string {
  const { caseSensitive = false, trim = true, normalize = false } = options;
  let out = text;
  if (trim) out = out.trim();
  if (!caseSensitive) out = out.toLowerCase();
  if (normalize) {
    out = out
      .replace(/[\p{P}\p{S}]/gu, " ") // punctuation & symbols → space
      .replace(/\s+/gu, " ")
      .trim();
  }
  return out;
}

/**
 * Extract a numeric value from free text. Handles thousands separators, a leading
 * currency symbol, trailing percent, and simple `a/b` fractions. Returns the
 * *last* number found (models tend to state the final answer last). `undefined`
 * if none is present.
 */
export function parseNumber(text: string): number | undefined {
  const cleaned = text.replace(/,(?=\d{3}\b)/g, "").replace(/[$£€]/g, "");
  const fraction = cleaned.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/g);
  if (fraction && fraction.length > 0) {
    const last = fraction[fraction.length - 1]!;
    const [a, b] = last.split("/").map((s) => Number(s.trim()));
    if (a !== undefined && b !== undefined && b !== 0) return a / b;
  }
  const matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return undefined;
  const value = Number(matches[matches.length - 1]);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Extract a single multiple-choice letter (A–H) from a model answer. Accepts
 * "(B)", "B.", "answer: b", or a bare "B". Returns the uppercase letter or
 * `undefined`.
 */
export function parseChoiceLetter(text: string): string | undefined {
  const trimmed = text.trim();
  // Prefer an explicit "answer is X" / "(X)" near the end.
  const explicit = trimmed.match(/(?:answer\s*(?:is|:)?\s*)?\(?\s*([A-Ha-h])\s*\)?[.\s]*$/);
  if (explicit) return explicit[1]!.toUpperCase();
  const anyLetter = trimmed.match(/\b([A-Ha-h])\b/);
  return anyLetter ? anyLetter[1]!.toUpperCase() : undefined;
}
