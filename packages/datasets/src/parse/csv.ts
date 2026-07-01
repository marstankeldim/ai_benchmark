/**
 * A small, correct CSV parser following RFC 4180 semantics: fields may be quoted
 * with double quotes, quoted fields may contain commas and newlines, and a
 * literal double quote inside a quoted field is written as two double quotes.
 *
 * We hand-roll a state machine rather than split on commas because the whole
 * point of a CSV parser is the cases that a naive split gets wrong. It tolerates
 * both `\n` and `\r\n` line endings and ignores a trailing newline.
 */

/** Parse CSV text into a matrix of raw string cells (no header handling). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    sawAnyChar = true;

    if (inQuotes) {
      if (ch === '"') {
        // A doubled quote is an escaped literal quote; otherwise it closes.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    switch (ch) {
      case '"':
        inQuotes = true;
        break;
      case ",":
        endField();
        break;
      case "\r":
        // Swallow the CR of a CRLF pair; a lone CR also terminates a row.
        if (text[i + 1] === "\n") i++;
        endRow();
        break;
      case "\n":
        endRow();
        break;
      default:
        field += ch;
    }
  }

  // Flush the final field/row unless the input ended exactly on a row boundary
  // (i.e. a trailing newline), which would otherwise yield a spurious empty row.
  if (field.length > 0 || row.length > 0) {
    endRow();
  } else if (sawAnyChar && rows.length === 0) {
    // Input was a single unterminated empty field, e.g. "".
    endRow();
  }

  return rows;
}

/**
 * Turn a CSV matrix into records keyed by the header row. Missing trailing cells
 * become empty strings; extra cells beyond the header are dropped. Blank rows
 * (a single empty cell) are skipped so trailing whitespace doesn't create junk.
 */
export function toRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];
  const header = rows[0]!;
  const records: Record<string, string>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    if (cells.length === 1 && cells[0] === "") continue;
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      record[header[c]!] = cells[c] ?? "";
    }
    records.push(record);
  }

  return records;
}
