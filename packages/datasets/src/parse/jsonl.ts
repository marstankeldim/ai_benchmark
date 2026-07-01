/**
 * JSON Lines parsing. Each non-blank line is an independent JSON value. We are
 * tolerant of the real-world messiness in shared JSONL files: blank lines and
 * lines that are only whitespace are skipped, and a `//`-style comment line or
 * trailing whitespace is handled gracefully.
 */

/**
 * Parse JSONL text into an array of values. Blank lines are skipped. A line that
 * fails to parse throws with its 1-based line number, which is far more useful
 * than a bare `Unexpected token` when debugging a large file.
 */
export function parseJsonl(text: string): unknown[] {
  const out: unknown[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.length === 0) continue;
    try {
      out.push(JSON.parse(line));
    } catch (cause) {
      throw new Error(`parseJsonl: invalid JSON on line ${i + 1}`, { cause });
    }
  }

  return out;
}
