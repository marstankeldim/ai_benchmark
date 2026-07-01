# EvalForge — Architecture

EvalForge is a reproducible benchmarking and evaluation platform for large language
models. It is designed around one guiding constraint:

> **Adding a new provider, benchmark, dataset format, or judge should require writing
> exactly one new file — never editing an existing one.**

Everything below serves that constraint through a small number of stable contracts
and strict dependency inversion.

---

## 1. Design principles

| Principle | How it shows up in the code |
|---|---|
| **Open/closed** | New providers/benchmarks/evaluators are *registered*, not wired in. Registries live in `shared`; implementations live in leaf packages. |
| **Dependency inversion** | The engine depends on `RunStore`, `ResponseCache`, and `Evaluator` *interfaces*, never on Prisma, Redis, or a specific model SDK. |
| **Reproducibility first** | Every run persists the full input: model, params, seed, prompt version, dataset version, git commit, and raw responses. A run can be replayed byte-for-byte from the cache. |
| **Statistical honesty** | Aggregates ship with confidence intervals, not just point estimates. Comparisons use paired bootstrap / permutation tests, never a naive delta. |
| **Small modules** | No file is a god-object. Each provider, evaluator, benchmark, and statistic is its own file. |
| **Typed end-to-end** | One source of truth for domain types (`@evalforge/shared`) shared by engine, API, and web. |

---

## 2. Package graph

```
                         ┌────────────────────┐
                         │  @evalforge/shared  │   types + contracts + utils
                         │  (no deps)          │   (the only "wide" import)
                         └─────────┬──────────┘
        ┌──────────────┬──────────┼───────────┬───────────────┐
        ▼              ▼          ▼           ▼               ▼
 ┌────────────┐ ┌───────────┐ ┌────────┐ ┌──────────┐  ┌───────────┐
 │ providers  │ │ datasets  │ │scoring │ │reporting │  │    db     │
 └─────┬──────┘ └────┬──────┘ └───┬────┘ └────┬─────┘  └─────┬─────┘
       │             │            │           │              │
       └──────┬──────┴─────┬──────┘           │              │
              ▼            ▼                   │              │
        ┌───────────────────────┐             │              │
        │      evaluators       │             │              │
        │ (exact/judge/code…)   │             │              │
        └───────────┬───────────┘             │              │
                    ▼                          │              │
        ┌───────────────────────┐             │              │
        │   benchmark-engine    │◀────────────┘              │
        │ run · grade · persist │                            │
        └───────────┬───────────┘                            │
        ┌───────────┼───────────────┬────────────────────────┘
        ▼           ▼               ▼
  ┌──────────┐ ┌─────────┐   ┌─────────────┐
  │benchmarks│ │apps/cli │   │  apps/api   │  Fastify + BullMQ
  └──────────┘ └─────────┘   └──────┬──────┘
                                    ▼
                              ┌─────────────┐
                              │  apps/web   │  Next.js dashboard
                              └─────────────┘
```

Edges point *down* the dependency graph. Nothing in a leaf package imports from the
engine or the apps — the arrows never reverse.

### Package responsibilities

- **`shared`** — Domain types (`GenerateRequest`, `ModelResponse`, `BenchmarkTask`,
  `TaskResult`, `RunSummary`…), the four core interfaces (`ModelProvider`,
  `Evaluator`, `RunStore`, `ResponseCache`), registries, and pure utilities
  (`Result`, concurrency pool, retry/timeout, id/hash, logger, config schemas).
- **`providers`** — One `ModelProvider` implementation per vendor over `fetch`.
  OpenAI/OpenRouter/Groq share an OpenAI-compatible base; Anthropic, Google, and
  Ollama have their own adapters. Ships a deterministic `MockProvider` for offline
  tests. Includes pricing tables + cost estimation.
- **`datasets`** — Loaders for JSON / JSONL / CSV / HuggingFace into the canonical
  `Dataset` shape, plus streaming and sampling helpers.
- **`scoring`** — Pure metric functions (accuracy, exact match, F1, pass@k, token
  efficiency) and inferential statistics (bootstrap CI, paired bootstrap,
  permutation test, Wilson interval, Cohen's d/h, Elo / Bradley–Terry).
- **`evaluators`** — Grading strategies implementing the `Evaluator` contract:
  exact/regex/numeric/includes/json-schema, embedding similarity, LLM-as-judge
  (model-agnostic), and a code-execution evaluator (pass@k) with a pluggable
  sandbox.
- **`reporting`** — Turns a `RunSummary` into Markdown / HTML / JSON / CSV, with
  self-contained inline SVG charts (radar, bars) — no browser required.
- **`db`** — Prisma schema + generated client + repository layer implementing
  `RunStore` against Postgres.
- **`benchmark-engine`** — Orchestrates the pipeline (below). Depends only on
  interfaces from `shared`.
- **`benchmarks`** — Concrete `Benchmark` definitions (HumanEval, GSM8K, MMLU,
  ARC, TruthfulQA…) + sample data + a registry. Each benchmark is one file.
- **`apps/cli`** — `evalforge run|list|report` — the fastest path to an end-to-end
  eval, works offline against the mock provider.
- **`apps/api`** — Fastify REST API; enqueues runs on BullMQ (Redis) with an
  in-process fallback.
- **`apps/web`** — Next.js dashboard: leaderboard, run detail, model comparison.

---

## 3. The evaluation pipeline

```
 RunConfig
    │  { benchmarks[], models[], sampling, concurrency, retries, timeout, seed, limit }
    ▼
┌───────────────┐   resolve benchmark + dataset from registries; pin versions
│  1. Plan      │   → expand into (model × benchmark × task × repeat) work items
└──────┬────────┘
       ▼
┌───────────────┐   bounded-concurrency pool; each item:
│  2. Execute   │     cache.get(key) ?? provider.generate(req)  (retry + timeout)
└──────┬────────┘     key = hash(provider, model, params, prompt)
       ▼
┌───────────────┐   benchmark.parseOutput(response) → evaluator.grade()
│  3. Grade     │   → TaskResult { score, passed, usage, cost, latency, error }
└──────┬────────┘
       ▼
┌───────────────┐   per (model × benchmark): metrics + bootstrap CIs;
│  4. Aggregate │   per pair: significance tests → RunSummary
└──────┬────────┘
       ▼
┌───────────────┐   store.saveRun(summary) / store.saveResults(results[])
│  5. Persist   │   (in-memory | Postgres) — idempotent by (runId, taskId)
└──────┬────────┘
       ▼
┌───────────────┐   reporting.render(summary) → md / html / json / csv
│  6. Report    │
└───────────────┘
```

**Resume** — results are persisted per `(runId, taskId)`. On restart the planner
skips items already present, so an interrupted run continues where it stopped.

**Caching** — a content-addressed cache (`hash(provider+model+params+prompt)`) makes
re-grading free and makes a run replayable without hitting a provider. Cache backends:
in-memory, filesystem, Redis.

**Concurrency / retries / timeout** — a single `mapWithConcurrency` pool with
per-item `withTimeout` and exponential-backoff `withRetry`, all in `shared/utils`.
Sequential execution is just `concurrency: 1`.

---

## 4. Core contracts

```ts
interface ModelProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
  generate(request: GenerateRequest, options?: CallOptions): Promise<ModelResponse>;
  embed?(request: EmbedRequest): Promise<EmbedResponse>;
  estimateCost(usage: TokenUsage, model: string): Cost;
}

interface Evaluator {
  readonly kind: EvaluatorKind;
  grade(input: GradeInput): Promise<GradeResult>;   // score ∈ [0,1], passed, rationale
}

interface Benchmark {
  readonly id: string; readonly version: string; readonly category: BenchmarkCategory;
  loadTasks(opts?: LoadOptions): Promise<BenchmarkTask[]>;
  buildRequest(task: BenchmarkTask): GenerateRequest;     // prompt construction
  parseOutput(res: ModelResponse, task: BenchmarkTask): ParsedOutput;
  readonly evaluator: Evaluator | EvaluatorSpec;
  readonly metrics: MetricName[];
}

interface RunStore {          // persistence port (in-memory | Prisma)
  createRun(run: RunRecord): Promise<void>;
  saveResult(result: TaskResult): Promise<void>;
  completedTaskIds(runId: string): Promise<Set<string>>;  // enables resume
  getRun(runId: string): Promise<StoredRun | null>;
  listRuns(query?: RunQuery): Promise<StoredRun[]>;
  leaderboard(query?: LeaderboardQuery): Promise<LeaderboardEntry[]>;
}

interface ResponseCache {     // caching port (memory | fs | redis)
  get(key: string): Promise<ModelResponse | null>;
  set(key: string, value: ModelResponse): Promise<void>;
}
```

Each is small on purpose: implementing one is a single-file exercise, and the engine
composes them without knowing the concrete type.

---

## 5. Reproducibility model

A run is reproducible because we persist **everything needed to recreate it**:

- **Inputs**: benchmark id + version, dataset id + version + content hash, task ids.
- **Model config**: provider, model id, temperature, top-p, max tokens, **seed**,
  stop sequences, and the exact prompt template version.
- **Environment**: EvalForge version, git commit, node version, timestamp.
- **Outputs**: raw provider response, parsed output, grade, token usage, cost, latency.

Given the same seed and a cache hit (or a deterministic provider), a replay produces
identical `TaskResult`s. The `Mock` provider makes CI runs fully deterministic.

---

## 6. Statistical layer (why it matters)

Point scores lie. EvalForge treats every metric as a sample:

- **Confidence intervals** — accuracy/pass@k reported with bootstrap or Wilson CIs.
- **Model-vs-model** — paired bootstrap + permutation test on per-item scores;
  reports a p-value and effect size (Cohen's h for proportions), not just Δ.
- **Leaderboards** — optional Elo / Bradley–Terry from pairwise judgments, à la
  LM Arena, with rating uncertainty.

This lives in `scoring/statistics` as pure, unit-tested functions with a seedable RNG.

---

## 7. Extension recipes (the "one file" promise)

- **New provider** → add `packages/providers/src/<vendor>.ts` implementing
  `ModelProvider`, register it. No engine change.
- **New benchmark** → add `benchmarks/src/<name>.ts` exporting a `Benchmark`,
  register it. No engine change.
- **New judge** → add `packages/evaluators/src/<name>.ts` implementing `Evaluator`.
- **New dataset format** → add a loader in `packages/datasets/src/loaders/`.
- **New report format** → add a renderer in `packages/reporting/src/renderers/`.
- **New persistence backend** → implement `RunStore` in a new package.

---

## 8. Deployment topology

```
┌──────────┐   REST    ┌──────────────┐   enqueue   ┌───────────────┐
│  web     │──────────▶│   api        │────────────▶│  BullMQ (Redis)│
│ (Next.js)│           │ (Fastify)    │             └──────┬─────────┘
└──────────┘           └──────┬───────┘                    │ dequeue
                              │ query                       ▼
                       ┌──────▼───────┐            ┌──────────────────┐
                       │  Postgres    │◀───────────│ engine worker    │
                       │ (Prisma)     │  persist   │ (benchmark-engine)│
                       └──────────────┘            └────────┬─────────┘
                                                            ▼
                                                 model providers (HTTP)
                                                 + code sandbox (Docker)
```

Everything is containerized via `docker-compose`. Redis and Postgres are optional for
local development: without them the engine runs in-process with a filesystem store.

See [`ROADMAP.md`](./ROADMAP.md) for the milestone plan and current status.
