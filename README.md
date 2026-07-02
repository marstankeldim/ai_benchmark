<div align="center">

# ⚒️ EvalForge

**A production-grade, reproducible benchmarking & evaluation platform for LLMs.**

Compare models side-by-side · run standard suites · build custom benchmarks ·
store every run · visualize over time · get statistically honest results.

</div>

---

EvalForge is what you reach for when "the model felt better" isn't good enough.
It runs standardized and custom benchmarks across many providers, grades outputs with
pluggable judges, persists every run for reproducibility, and reports results with
real confidence intervals and significance tests — in the spirit of OpenAI Evals,
LM Arena, SWE-bench, MMLU, and LiveBench.

The whole system is built around one rule: **adding a new provider, benchmark, judge,
or dataset format takes exactly one new file.** See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

> **Runs with zero setup.** No API keys, no database, no Docker required — a
> deterministic `mock` provider drives the entire pipeline offline, which is how the
> 100+ tests stay fast and reproducible.

## Features

- **7 model providers** behind one `fetch`-based interface — OpenAI, Anthropic,
  Google Gemini, OpenRouter, Groq, Ollama (local), plus a deterministic **mock** for
  offline runs. No vendor SDKs.
- **Benchmark suites** across coding, math, reasoning, and knowledge — HumanEval,
  GSM8K, MMLU, ARC, TruthfulQA — each one file, self-registering, with sample data.
- **Pluggable judges** — exact / regex / numeric / includes / choice / JSON-schema,
  embedding similarity, LLM-as-judge (model-agnostic), and sandboxed code execution.
- **A real engine** — sequential or parallel execution, retries with backoff,
  timeouts, content-addressed caching, and **resume-after-interrupt**.
- **Statistical rigor** — bootstrap & Wilson confidence intervals, paired
  permutation / McNemar / Welch tests, Cohen's d/h effect sizes, and Elo /
  Bradley–Terry leaderboards. Every headline number ships with a CI.
- **Pluggable persistence** — in-memory, filesystem, and Postgres (Prisma) behind a
  single `RunStore` port; every run reproducible byte-for-byte from stored config.
- **REST API** (Fastify, in-process job queue, BullMQ-ready) and a **Next.js +
  Tailwind dashboard** (Recharts) with radar / score-history / latency / cost /
  benchmark-breakdown / heatmap views.
- **Reports** in Markdown, HTML (print-ready → PDF), JSON, and CSV with
  self-contained inline SVG charts.

## Quickstart (offline, no keys)

```bash
npm install

# Run two models on four benchmarks, fully offline, deterministic:
npm run cli -- run \
  --benchmark gsm8k,mmlu,arc,truthfulqa \
  --model mock:strong --model mock:weak --seed 42

npm run cli -- list                              # stored runs
npm run cli -- leaderboard --dimension overall   # ranked across all runs
npm run cli -- report --format html --out ./report.html   # latest run → HTML
```

Real models — add a key and swap the model spec:

```bash
cp .env.example .env          # fill in OPENAI_API_KEY / ANTHROPIC_API_KEY / …
npm run cli -- run --benchmark humaneval --model openai:gpt-4o --limit 10
npm run cli -- run \
  --benchmark gsm8k,mmlu,arc \
  --model anthropic:claude-sonnet-4-20250514 --model openai:gpt-4o \
  --repeat 3 --concurrency 8 --report markdown,html,json
```

## API + dashboard

```bash
npm run seed        # populate a few example runs (offline)
npm run dev:api     # Fastify REST API on http://localhost:4000
npm run dev:web     # Next.js dashboard on http://localhost:3000
```

Then hit the API directly:

```bash
curl localhost:4000/benchmarks
curl localhost:4000/leaderboard?dimension=coding
curl -X POST localhost:4000/benchmark/run -H 'content-type: application/json' \
  -d '{"benchmarks":["mmlu"],"models":[{"provider":"mock","model":"mock:strong"}],"seed":1}'
```

## The full stack (Docker)

```bash
docker compose up -d postgres redis          # datastores
docker compose up --build api                # REST API (uses Postgres)
docker compose --profile web up --build web  # + dashboard on :3000

npm run db:generate && npm run db:migrate    # create the Prisma schema
```

Without `DATABASE_URL`/`REDIS_URL` the engine falls back to a filesystem run store
and in-process execution — the API and CLI need no infrastructure at all.

## Programmatic use

```ts
import { createEngine } from "@evalforge/benchmark-engine";
import { registerBuiltinBenchmarks } from "@evalforge/benchmarks";
import "@evalforge/providers"; // registers every provider

registerBuiltinBenchmarks();

const engine = createEngine(); // in-memory store + cache by default
const summary = await engine.run({
  benchmarks: ["gsm8k", "mmlu"],
  models: [
    { provider: "openai", model: "gpt-4o", params: { temperature: 0, seed: 7 } },
    { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  ],
  concurrency: 8,
});

const model = summary.byModel[0]!;
console.log(model.overall);                                  // 0.86
const gsm = model.byBenchmark.find((b) => b.benchmarkId === "gsm8k")!;
console.log(gsm.metrics.accuracy, gsm.intervals.accuracy);   // 0.86 { low, high, ... }
console.log(summary.comparisons[0]?.test);                   // { delta, pValue, effectSize, ... }
```

## Repository layout

```
packages/
  shared/            types + the four core contracts + utils   (everything depends on this)
  providers/         one ModelProvider per vendor (fetch-based) + deterministic mock
  datasets/          JSON / JSONL / CSV / HuggingFace loaders + seeded sampling
  scoring/           point metrics (accuracy, pass@k, F1) + inferential statistics
  evaluators/        exact · regex · numeric · choice · json-schema · semantic · llm-judge · code-exec
  reporting/         markdown / html / json / csv renderers with inline SVG charts
  benchmark-engine/  the run pipeline (plan→execute→grade→aggregate→persist) + stores + caches
  db/                Prisma schema + client + PrismaRunStore (Postgres)
benchmarks/          concrete benchmark definitions + example datasets + registry
apps/
  cli/               evalforge run | list | report | benchmarks | providers | leaderboard
  api/               Fastify REST API (in-process queue, BullMQ-ready)
  web/               Next.js + Tailwind + Recharts dashboard
docs/                architecture + roadmap
```

## Development

```bash
npm run typecheck                          # strict tsc across all packages
npm test                                   # vitest — 100+ unit + integration tests
npm run build                              # tsup build of every library
npm run db:generate                        # Prisma client (needed to typecheck @evalforge/db)
```

CI (GitHub Actions) runs typecheck → DB typecheck → test → build on Node 20 and 22.

## Contributing a benchmark

Create `benchmarks/src/my-bench.ts` exporting a `Benchmark` (use `defineBenchmark`),
add one line to `benchmarks/src/registry.ts`, and you're done — the engine, CLI, API,
and dashboard pick it up automatically. Full recipe in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#7-extension-recipes-the-one-file-promise).

## License

MIT — see [`LICENSE`](LICENSE).
