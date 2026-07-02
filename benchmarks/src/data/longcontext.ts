import { createRng } from "@evalforge/shared";
import type { BenchmarkTask } from "@evalforge/shared";

/**
 * Synthetic needle-in-a-haystack documents for long-context retrieval. Each task
 * is a filler document of ~N tokens with a single factual "needle" (a numeric
 * access code) buried at a controlled depth; the question asks for that number.
 *
 * Everything is generated from a seeded RNG keyed on (size, depth), so the same
 * task id always yields byte-identical text — documents are as reproducible as
 * any file-based dataset, without shipping megabytes of filler.
 */

/** Rough chars-per-token used to size documents. */
const CHARS_PER_TOKEN = 4;

/** Neutral filler sentences — varied enough that models can't pattern-skip. */
const FILLER: string[] = [
  "The quarterly review consolidated findings from twelve regional offices before publication.",
  "Operational metrics remained within the expected band throughout the reporting window.",
  "The committee deferred the procurement decision pending an updated vendor assessment.",
  "Field engineers documented routine maintenance across the northern distribution sites.",
  "Customer satisfaction surveys were collected, anonymized, and archived per policy.",
  "The audit trail confirmed that all change requests followed the standard approval flow.",
  "Inventory reconciliation completed two days ahead of the scheduled close date.",
  "Training completion rates improved modestly compared with the previous cycle.",
  "The facilities team recalibrated environmental controls in the secondary data hall.",
  "Legal counsel reviewed the revised terms and returned comments within the agreed window.",
  "Budget variances were attributed primarily to shifted milestone timing, not scope change.",
  "The onboarding cohort completed orientation modules across three consecutive sessions.",
  "Incident response drills were conducted quarterly with rotating on-call participants.",
  "Archived correspondence was migrated to the new retention system without data loss.",
  "The steering group ratified the roadmap with one abstention recorded in the minutes.",
  "Supplier lead times normalized after the seasonal logistics disruption subsided.",
  "Documentation updates were queued for the next scheduled publication batch.",
  "The regional summary highlighted steady adoption across all monitored segments.",
];

export interface LongContextSpec {
  /** Approximate document length in tokens. */
  tokens: number;
  /** Fractional position of the needle within the document, in (0, 1). */
  depth: number;
}

/** The default offline suite: 10k and 50k tokens at three depths each. */
export const DEFAULT_SPECS: LongContextSpec[] = [10_000, 50_000].flatMap((tokens) =>
  [0.2, 0.5, 0.8].map((depth) => ({ tokens, depth })),
);

/** Deterministically build one needle document + task for a (size, depth) spec. */
export function makeLongContextTask(spec: LongContextSpec): BenchmarkTask {
  const rng = createRng(`longcontext-${spec.tokens}-${spec.depth}`);
  const code = rng.int(100_000, 999_999);
  const needle = `For the record, the vault access number assigned by the compliance appendix is ${code}.`;

  const targetChars = spec.tokens * CHARS_PER_TOKEN;
  const sentences: string[] = [];
  let chars = 0;
  while (chars < targetChars) {
    const s = rng.pick(FILLER);
    sentences.push(s);
    chars += s.length + 1;
  }
  const at = Math.min(sentences.length - 1, Math.max(0, Math.floor(spec.depth * sentences.length)));
  sentences.splice(at, 0, needle);

  const sizeLabel = `${Math.round(spec.tokens / 1000)}k`;
  return {
    id: `lc-${sizeLabel}-d${Math.round(spec.depth * 100)}`,
    input: sentences.join(" "),
    expected: String(code),
    metadata: { tokens: spec.tokens, depth: spec.depth },
  };
}

/** Build a task list for arbitrary sizes/depths (e.g. 100k/500k stress suites). */
export function makeLongContextTasks(specs: LongContextSpec[] = DEFAULT_SPECS): BenchmarkTask[] {
  return specs.map(makeLongContextTask);
}
