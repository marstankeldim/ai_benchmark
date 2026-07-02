# EvalForge — Roadmap

Status legend: ✅ done · 🚧 in progress · ⭕ planned

The project is built bottom-up: contracts first, then leaf packages, then the engine,
then the surfaces (CLI/API/web), then hardening. Each milestone is independently
useful and testable.

> **Current status.** M0–M9 are implemented and verified: the full offline core
> (providers, scoring, datasets, evaluators, engine, benchmarks, reporting), the
> CLI, the Fastify REST API, the Next.js dashboard, and the Prisma/Postgres
> `RunStore` all exist and pass 100+ unit/integration tests plus a clean strict-
> TypeScript build. M10 (Playwright e2e, load testing) is in progress; the stretch
> goals below are the roadmap beyond 1.0.

---

## M0 — Foundation ✅
*The contracts every other package depends on.*

- ✅ Monorepo (npm workspaces), strict TypeScript, path aliases, Vitest.
- ✅ `@evalforge/shared`: domain types, the four core interfaces, registries.
- ✅ Utilities: `Result`, concurrency pool, retry/timeout, id/hash, logger, config (zod).
- ✅ Architecture + roadmap docs.

**Exit criteria:** `npm run typecheck` passes on `shared`; contracts are frozen.

## M1 — Model providers ✅
*One uniform interface over every vendor.*

- ✅ `ModelProvider` over `fetch` (no vendor SDK lock-in).
- ✅ OpenAI, OpenRouter, Groq (shared OpenAI-compatible base).
- ✅ Anthropic (Messages API), Google Gemini, Ollama (local).
- ✅ Deterministic `MockProvider` for offline/CI runs.
- ✅ Pricing tables + `estimateCost`; provider registry (`createProvider`).

**Exit criteria:** every provider parses a real response shape; mock provider unit-tested.

## M2 — Scoring & statistics ✅
*Numbers you can defend.*

- ✅ Metrics: accuracy, exact match, F1, pass@k (unbiased estimator), token efficiency.
- ✅ Statistics: bootstrap & paired-bootstrap CIs, permutation test, Wilson interval,
  Cohen's d/h, Elo / Bradley–Terry, seedable RNG.

**Exit criteria:** statistics unit-tested against known closed-form values.

## M3 — Datasets ✅
- ✅ Loaders: JSON, JSONL, CSV, HuggingFace (datasets-server API).
- ✅ Sampling, shuffling (seeded), streaming, content hashing for versioning.

## M4 — Evaluators / judges ✅
- ✅ Exact / regex / numeric-tolerance / includes / JSON-schema.
- ✅ Embedding semantic similarity (provider-backed).
- ✅ LLM-as-judge (model-agnostic, configurable rubric, structured verdicts).
- ✅ Code-execution evaluator (pass@k) with a pluggable sandbox (local subprocess
  now; Docker isolation next).

## M5 — Benchmark engine ✅
*The heart.*

- ✅ Pipeline: plan → execute → grade → aggregate → persist → report.
- ✅ Sequential + parallel execution, retries, timeouts.
- ✅ Content-addressed caching; resume interrupted runs.
- ✅ `RunStore` / `ResponseCache` ports with in-memory implementations.
- ✅ Progress events for CLI/API streaming.

## M6 — Benchmarks & CLI ✅
- ✅ HumanEval (subset), GSM8K, MMLU, ARC, TruthfulQA definitions + sample data.
- ✅ Benchmark registry.
- ✅ `evalforge run|list|report` CLI — end-to-end offline via mock provider.

## M7 — Persistence & API ✅
- ✅ Prisma schema (Users, Providers, Models, Benchmarks, Datasets, Runs, Results,
  Experiments, Leaderboard) + repository `RunStore`.
- ✅ Fastify REST API: `/benchmark/run`, `/benchmarks`, `/runs`, `/results`,
  `/datasets`, `/providers`, `/leaderboard`.
- ✅ BullMQ run queue with in-process fallback (Redis optional).

## M8 — Dashboard ✅
- ✅ Next.js + Tailwind + shadcn/ui.
- ✅ Leaderboard, run detail, model comparison (radar / score-history / latency /
  cost / benchmark breakdown / heatmap via Recharts).
- ✅ Filter, sort, export.

## M9 — Reporting ✅
- ✅ Markdown / HTML / JSON / CSV; inline SVG charts; strengths/weaknesses/recommendations.
- ⭕ PDF via headless render (print-ready HTML ships now).

## M10 — Hardening 🚧
- ✅ Unit + integration tests (scoring, evaluators, providers, engine e2e).
- ✅ GitHub Actions CI (typecheck · test · build).
- ✅ Dockerfiles + `docker-compose` (postgres · redis · api · web · sandbox).
- 🚧 Playwright e2e for the dashboard.
- ⭕ Load testing for thousands of concurrent evaluations.

---

## Stretch goals (post-1.0)

- ⭕ Elo leaderboard UI + pairwise "arena" voting.
- ⭕ Tournament mode & Bradley–Terry rankings surfaced in the dashboard.
- ⭕ Benchmark & prompt version diffing.
- ⭕ Cost-optimization analytics (accuracy-per-dollar frontier).
- ⭕ Multi-agent & RAG evaluation harnesses.
- ⭕ Vision / audio benchmarks.
- ⭕ Safety / jailbreak / bias suites.
- ⭕ Automatic benchmark generation.
- ⭕ GitHub integration for continuous model-regression testing.
- ⭕ Public shareable leaderboards.

---

## Testing strategy

| Layer | Tooling | What it proves |
|---|---|---|
| Unit | Vitest | Metrics/statistics match closed-form values; parsers handle real payloads. |
| Integration | Vitest | Engine runs a benchmark end-to-end against the mock provider + in-memory store. |
| Contract | Vitest | Every provider/evaluator satisfies its interface (shared test suite). |
| E2E | Playwright | Dashboard renders a seeded run and comparison. |
| CI | GitHub Actions | typecheck → test → build on every push. |
