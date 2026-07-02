/**
 * Shared API context: the engine, its persistent store, and runtime-registered
 * provider credentials and datasets. Importing `@evalforge/benchmarks` and
 * `@evalforge/providers` here registers every built-in as a side effect, so the
 * API serves the full catalog.
 */

import { join } from "node:path";
import "@evalforge/benchmarks";
import "@evalforge/providers";
import { createEngine, FileSystemRunStore, type Engine } from "@evalforge/benchmark-engine";
import { createProvider } from "@evalforge/providers";
import { loadEnv, type Dataset, type ModelConfig, type ProviderConfig, type RunStore } from "@evalforge/shared";
import { JobRunner } from "./jobs.js";

export interface ApiContext {
  engine: Engine;
  store: RunStore;
  jobs: JobRunner;
  /** Provider credential overrides registered via POST /providers. */
  providerOverrides: Map<string, ProviderConfig>;
  /** Datasets registered via POST /datasets. */
  datasets: Map<string, Dataset>;
}

export function createContext(overrides: Partial<ApiContext> = {}): ApiContext {
  const env = loadEnv();
  const providerOverrides = overrides.providerOverrides ?? new Map<string, ProviderConfig>();
  const store =
    overrides.store ?? new FileSystemRunStore(process.env.EVALFORGE_RUNS_DIR ?? join(process.cwd(), ".evalforge", "runs"));

  const engine =
    overrides.engine ??
    createEngine({
      store,
      // Provider resolution honors credentials registered at runtime.
      providerResolver: (model: ModelConfig) =>
        createProvider(model.provider, providerOverrides.get(model.provider) ?? {}, env as unknown as NodeJS.ProcessEnv),
    });

  return {
    engine,
    store,
    jobs: overrides.jobs ?? new JobRunner(engine),
    providerOverrides,
    datasets: overrides.datasets ?? new Map<string, Dataset>(),
  };
}
