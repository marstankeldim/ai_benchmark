/**
 * The CLI's persistence: a {@link FileSystemRunStore} rooted at `.evalforge/runs`
 * (override with `EVALFORGE_RUNS_DIR`). `run` writes to it and `list`, `report`,
 * `leaderboard`, and resume all read from it — no database required. Point the API
 * at Postgres for a shared, multi-writer deployment.
 */

import { join } from "node:path";
import { FileSystemRunStore } from "@evalforge/benchmark-engine";

export const runsDir = process.env.EVALFORGE_RUNS_DIR ?? join(process.cwd(), ".evalforge", "runs");

let store: FileSystemRunStore | undefined;

/** Shared CLI run store (lazily constructed). */
export function getStore(): FileSystemRunStore {
  if (!store) store = new FileSystemRunStore(runsDir);
  return store;
}
