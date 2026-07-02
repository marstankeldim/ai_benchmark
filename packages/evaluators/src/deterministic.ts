/**
 * Deterministic (non-model) judges: exact match, regex, numeric tolerance,
 * substring inclusion, multiple-choice, and JSON-schema validity. These are the
 * workhorses — fast, free, and reproducible — used by MMLU, GSM8K, ARC, and any
 * benchmark with a crisp gold answer.
 */

import type {
  ChoiceSpec,
  Evaluator,
  ExactMatchSpec,
  GradeInput,
  GradeResult,
  IncludesSpec,
  JsonSchemaSpec,
  NumericSpec,
  RegexSpec,
} from "@evalforge/shared";
import { extractJson } from "@evalforge/shared";
import { normalizeText, parseChoiceLetter, parseNumber } from "./normalize.js";
import { validateJsonSchema } from "./json-schema.js";

const pass = (passed: boolean, extra: Partial<GradeResult> = {}): GradeResult => ({
  score: passed ? 1 : 0,
  passed,
  label: passed ? "correct" : "incorrect",
  ...extra,
});

/** Exact string equality after configurable normalization. */
export class ExactMatchEvaluator implements Evaluator {
  readonly kind = "exact-match" as const;
  constructor(private readonly spec: ExactMatchSpec = { kind: "exact-match" }) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    if (task.expected === undefined) return pass(false, { rationale: "no gold answer" });
    const opts = {
      caseSensitive: this.spec.caseSensitive ?? false,
      trim: this.spec.trim ?? true,
      normalize: this.spec.normalize ?? false,
    };
    return pass(normalizeText(output.value, opts) === normalizeText(task.expected, opts));
  }
}

/** Passes when the answer matches a regular expression. */
export class RegexEvaluator implements Evaluator {
  readonly kind = "regex" as const;
  private readonly re: RegExp;
  constructor(spec: RegexSpec) {
    this.re = new RegExp(spec.pattern, spec.flags);
  }
  async grade({ output }: GradeInput): Promise<GradeResult> {
    return pass(this.re.test(output.value));
  }
}

/** Numeric equality within an absolute and/or relative tolerance. */
export class NumericEvaluator implements Evaluator {
  readonly kind = "numeric" as const;
  constructor(private readonly spec: NumericSpec = { kind: "numeric" }) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    if (task.expected === undefined) return pass(false, { rationale: "no gold answer" });
    const got = parseNumber(output.value);
    const want = parseNumber(task.expected);
    if (got === undefined || want === undefined) {
      return pass(false, { rationale: `unparseable number (got=${got}, want=${want})` });
    }
    const abs = this.spec.tolerance ?? 0;
    const rel = this.spec.relativeTolerance ?? 0;
    const allowed = Math.max(abs, rel * Math.abs(want));
    return pass(Math.abs(got - want) <= allowed + 1e-9, {
      rationale: `got ${got}, expected ${want} (±${allowed})`,
    });
  }
}

/** Passes when the answer contains required reference substrings (all or any). */
export class IncludesEvaluator implements Evaluator {
  readonly kind = "includes" as const;
  constructor(private readonly spec: IncludesSpec = { kind: "includes" }) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    const source = task.reference ?? task.expected ?? "";
    const needles = source
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (needles.length === 0) return pass(false, { rationale: "no reference substrings" });

    const cs = this.spec.caseSensitive ?? false;
    const hay = cs ? output.value : output.value.toLowerCase();
    const hit = (n: string): boolean => hay.includes(cs ? n : n.toLowerCase());
    const passed = this.spec.mode === "all" ? needles.every(hit) : needles.some(hit);
    return pass(passed);
  }
}

/** Multiple-choice: compare the chosen letter/label against the gold letter. */
export class ChoiceEvaluator implements Evaluator {
  readonly kind = "choice" as const;
  constructor(private readonly spec: ChoiceSpec = { kind: "choice" }) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    if (task.expected === undefined) return pass(false, { rationale: "no gold answer" });
    const got = parseChoiceLetter(output.value) ?? output.value.trim().toUpperCase();
    const want = normalizeGold(task.expected, task.choices);
    return pass(got === want, { rationale: `chose ${got}, gold ${want}` });
  }
}

/** Resolve a gold answer to a canonical letter, mapping full choice text if needed. */
function normalizeGold(expected: string, choices?: string[]): string {
  const trimmed = expected.trim();
  if (trimmed.length === 1) return trimmed.toUpperCase();
  const letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
  if (choices) {
    const idx = choices.findIndex((c) => c.trim() === trimmed);
    if (idx >= 0) return letters[idx]!;
  }
  return parseChoiceLetter(trimmed) ?? trimmed.toUpperCase();
}

/** Structured-output validity against a JSON Schema. */
export class JsonSchemaEvaluator implements Evaluator {
  readonly kind = "json-schema" as const;
  constructor(private readonly spec: JsonSchemaSpec) {}

  async grade({ output }: GradeInput): Promise<GradeResult> {
    const value = output.parsed ?? extractJson(output.raw) ?? safeParse(output.value);
    if (value === undefined) return pass(false, { rationale: "output is not valid JSON" });
    const { valid, errors } = validateJsonSchema(value, this.spec.schema);
    return pass(valid, {
      ...(errors.length ? { rationale: errors.slice(0, 3).join("; ") } : {}),
    });
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
