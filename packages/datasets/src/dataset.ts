/**
 * Building canonical {@link Dataset} objects and applying {@link LoadOptions}.
 *
 * A dataset's identity is its *content*: two datasets with the same tasks share a
 * `contentHash`, which is how EvalForge versions data for reproducibility. The
 * hash is taken over only the task fields that affect grading (id, input,
 * expected, choices, reference) — not volatile metadata — so re-tagging a dataset
 * doesn't spuriously invalidate cached runs.
 */

import { contentHash, createRng } from "@evalforge/shared";
import type {
  BenchmarkTask,
  Dataset,
  DatasetSource,
  LoadOptions,
  Metadata,
} from "@evalforge/shared";

/** Project a task down to the fields that define its grading semantics. */
function fingerprint(task: BenchmarkTask): unknown {
  return {
    id: task.id,
    input: task.input,
    expected: task.expected ?? null,
    choices: task.choices ?? null,
    reference: task.reference ?? null,
  };
}

/** The content hash of a task list — the dataset's reproducible fingerprint. */
export function hashTasks(tasks: readonly BenchmarkTask[]): string {
  return contentHash(tasks.map(fingerprint));
}

export interface BuildDatasetInput {
  id: string;
  name: string;
  version?: string;
  description?: string;
  tasks: BenchmarkTask[];
  source?: DatasetSource;
  metadata?: Metadata;
}

/** Assemble a {@link Dataset}, computing its content hash from the tasks. */
export function buildDataset(input: BuildDatasetInput): Dataset {
  return {
    id: input.id,
    name: input.name,
    version: input.version ?? "1.0.0",
    tasks: input.tasks,
    contentHash: hashTasks(input.tasks),
    ...(input.description ? { description: input.description } : {}),
    ...(input.source ? { source: input.source } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

/**
 * Apply load-time transformations in a deterministic order: filter → split →
 * shuffle (seeded) → limit. Shuffling before limiting means a capped run is a
 * *random* sample of the dataset, not just its head — important for honest
 * small-N evals.
 */
export function applyLoadOptions(
  tasks: readonly BenchmarkTask[],
  options: LoadOptions = {},
): BenchmarkTask[] {
  let out = tasks.slice();

  if (options.split) {
    out = out.filter((t) => (t.metadata?.split ?? undefined) === options.split);
  }
  if (options.filter) {
    out = out.filter(options.filter);
  }
  if (options.shuffle) {
    out = createRng(options.seed ?? 0).shuffle(out);
  }
  if (options.limit !== undefined && options.limit >= 0) {
    out = out.slice(0, options.limit);
  }
  return out;
}
