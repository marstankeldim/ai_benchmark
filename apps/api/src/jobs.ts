/**
 * In-process job runner — the "BullMQ fallback" from the architecture. When
 * Redis is unavailable we execute runs on the local event loop and track their
 * status in memory; the public shape (submit → id, poll status) matches what a
 * BullMQ-backed worker would expose, so swapping in a real queue is a drop-in.
 */

import { id as makeId } from "@evalforge/shared";
import type { RunConfig, RunId, RunSummary } from "@evalforge/shared";
import type { Engine } from "@evalforge/benchmark-engine";

export type JobState = "queued" | "running" | "completed" | "failed";

export interface JobStatus {
  runId: RunId;
  state: JobState;
  error?: string;
  submittedAt: string;
}

export class JobRunner {
  private readonly jobs = new Map<RunId, JobStatus>();

  constructor(private readonly engine: Engine) {}

  /** Start a run in the background and return its id immediately. */
  submitAsync(config: RunConfig): RunId {
    const runId = makeId("run");
    this.jobs.set(runId, { runId, state: "running", submittedAt: new Date().toISOString() });
    void this.engine
      .run(config, { runId })
      .then(() => this.mark(runId, "completed"))
      .catch((err: unknown) => this.mark(runId, "failed", err instanceof Error ? err.message : String(err)));
    return runId;
  }

  /** Run synchronously and return the full summary (used by the default path). */
  async runSync(config: RunConfig): Promise<RunSummary> {
    const runId = makeId("run");
    this.jobs.set(runId, { runId, state: "running", submittedAt: new Date().toISOString() });
    try {
      const summary = await this.engine.run(config, { runId });
      this.mark(runId, "completed");
      return summary;
    } catch (err) {
      this.mark(runId, "failed", err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  status(runId: RunId): JobStatus | undefined {
    return this.jobs.get(runId);
  }

  private mark(runId: RunId, state: JobState, error?: string): void {
    const existing = this.jobs.get(runId);
    this.jobs.set(runId, {
      runId,
      state,
      submittedAt: existing?.submittedAt ?? new Date().toISOString(),
      ...(error ? { error } : {}),
    });
  }
}
