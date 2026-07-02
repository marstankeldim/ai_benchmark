/**
 * Small answer-extraction helpers shared by benchmark `parseOutput`s. These live
 * here (rather than importing from `@evalforge/evaluators`) so the benchmarks
 * package stays independent of the judge implementations — a benchmark declares
 * *what* to grade, an evaluator decides *how*.
 */

export const CHOICE_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

/** Extract a multiple-choice letter (A–H) from a model answer, else `undefined`. */
export function extractChoiceLetter(text: string): string | undefined {
  const trimmed = text.trim();
  const explicit = trimmed.match(/(?:answer\s*(?:is|:)?\s*)?\(?\s*([A-Ha-h])\s*\)?[.)\s]*$/);
  if (explicit) return explicit[1]!.toUpperCase();
  const boxed = trimmed.match(/\\boxed\{([A-Ha-h])\}/);
  if (boxed) return boxed[1]!.toUpperCase();
  const first = trimmed.match(/\b([A-Ha-h])\b/);
  return first ? first[1]!.toUpperCase() : undefined;
}

/**
 * Extract the final numeric answer. Prefers the value after a `####` marker (the
 * GSM8K convention), then a `\boxed{}`, then the last number in the text.
 */
export function extractFinalNumber(text: string): string | undefined {
  const hashed = text.match(/####\s*(-?\$?\d[\d,]*(?:\.\d+)?)/);
  if (hashed) return hashed[1]!.replace(/[$,]/g, "");
  const boxed = text.match(/\\boxed\{(-?\$?\d[\d,]*(?:\.\d+)?)\}/);
  if (boxed) return boxed[1]!.replace(/[$,]/g, "");
  const numbers = text.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/g);
  return numbers && numbers.length > 0 ? numbers[numbers.length - 1] : undefined;
}

/** Extract fenced code (```lang ... ```), falling back to the whole text. */
export function extractCode(text: string): string {
  const fence = text.match(/```(?:[a-zA-Z]+)?\s*\n([\s\S]*?)```/);
  return (fence ? fence[1]! : text).trim();
}
