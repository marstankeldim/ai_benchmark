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

## Features

- **6 model providers** behind one interface — OpenAI, Anthropic, Google Gemini,
  OpenRouter, Groq, Ollama (local), plus a deterministic mock for offline runs.
- **Benchmark suites** across coding, math, reasoning, knowledge, long-context, tool
  use, and agents — HumanEval, GSM8K, MMLU, ARC, TruthfulQA, and more.
- **Pluggable judges** — exact/regex/numeric/JSON-schema, embedding similarity,
  LLM-as-judge, and sandboxed code execution (pass@k).
- **A real engine** — parallel or sequential execution, retries, timeouts,
  content-addressed caching, and resume-after-interrupt.
- **Statistical rigor** — bootstrap confidence intervals, paired permutation tests,
  effect sizes, and Elo / Bradley–Terry leaderboards.
- **Full persistence** — Postgres via Prisma; every run reproducible from stored config.
- **REST API** (Fastify + BullMQ) and a **Next.js dashboard** with radar / history /
  latency / cost / heatmap charts.
- **Reports** in Markdown, HTML, JSON, and CSV with inline charts.

## Quickstart

```bash
# 1. Install (npm workspaces — no pnpm required)
npm install

# 2. Run a benchmark end-to-end, fully offline, with the deterministic mock model
npm run cli -- run --benchmark gsm8k --model mock:balanced --limit 20

# 3. See stored runs and open the latest HTML report
npm run cli -- list
npm run cli -- report --latest --format html --out ./runs

# 4. Real models: copy env and add a key
cp .env.example .env      # fill in OPENAI_API_KEY / ANTHROPIC_API_KEY / …
npm run cli -- run --benchmark humaneval --model openai:gpt-4o --limit 10
```

Compare several models on several benchmarks in one shot:

```bash
npm run cli -- run \
  --benchmark gsm8k,mmlu,arc \
  --model "anthropic:claude-opus-4-8,openai:gpt-4o,google:gemini-2.0-flash" \
  --repeat 3 --concurrency 8 --report html
```

## The full stack (Docker)

```bash
docker compose up -d          # postgres + redis + api + web + sandbox
npm run db:migrate            # apply Prisma schema
npm run seed                  # seed example models/benchmarks/a sample run
open http://localhost:3000    # dashboard
```

## Programmatic use

```ts
import { runEvaluation } from "@evalforge/benchmark-engine";
import { registerCoreBenchmarks } from "@evalforge/benchmarks";
import { createProvider } from "@evalforge/providers";

registerCoreBenchmarks();

const summary = await runEvaluation({
  benchmarks: ["gsm8k"],
  models: [{ provider: "openai", model: "gpt-4o", params: { temperature: 0, seed: 7 } }],
  limit: 50,
  concurrency: 8,
});

console.log(summary.byModel[0].metrics.accuracy);          // 0.86
console.log(summary.byModel[0].intervals.accuracy);        // { low: 0.78, high: 0.92 }
```

## Repository layout

```
packages/
  shared/            types + the four core contracts + utils   (everything depends on this)
  providers/         one ModelProvider per vendor (fetch-based)
  datasets/          JSON / JSONL / CSV / HuggingFace loaders
  scoring/           metrics + inferential statistics
  evaluators/        exact · regex · numeric · semantic · llm-judge · code-exec
  reporting/         markdown / html / json / csv renderers
  benchmark-engine/  the run pipeline (plan→execute→grade→aggregate→persist→report)
  db/                Prisma schema + client + RunStore repository
benchmarks/          concrete benchmark definitions + sample data + registry
apps/
  cli/               evalforge run|list|report
  api/               Fastify REST API + BullMQ queue
  web/               Next.js dashboard
database/            SQL init + migration notes
docs/                architecture, roadmap, ADRs, diagrams
```

## Development

```bash
npm run typecheck     # strict tsc across core packages
npm run test          # vitest unit + integration
npm run lint          # eslint
npm run build         # build all publishable packages
```

## Contributing a benchmark

Create `benchmarks/src/my-bench.ts` exporting a `Benchmark`, then register it. That's
the entire change — the engine, CLI, API, and dashboard pick it up automatically. Full
recipe in [`docs/ARCHITECTURE.md#7-extension-recipes`](docs/ARCHITECTURE.md).

## License

MIT — see [`LICENSE`](LICENSE).
