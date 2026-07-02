/**
 * Long-context retrieval benchmark (needle-in-a-haystack). Documents of ~10k and
 * ~50k tokens hide a numeric access code at 20/50/80% depth; the model must
 * retrieve it. Latency is tracked per size via task metadata, so reports can
 * show how retrieval and speed degrade as the context grows.
 *
 * Documents are generated deterministically (see `data/longcontext.ts`), and
 * `makeLongContextTasks` is exported for building 100k/500k stress suites:
 *
 *   makeLongContextTasks([{ tokens: 500_000, depth: 0.5 }])
 */

import type { BenchmarkTask, GenerateRequest } from "@evalforge/shared";
import { defineBenchmark } from "./lib/define.js";
import { extractFinalNumber } from "./lib/parse.js";
import { DEFAULT_SPECS, makeLongContextTasks } from "./data/longcontext.js";

const SYSTEM =
  "You will be given a long document and then a question about a specific fact inside it. " +
  "Answer from the document only. End your reply with the answer on its own line in the " +
  "form '#### <number>'.";

const QUESTION =
  "What is the vault access number assigned by the compliance appendix, as stated in the document?";

function buildRequest(task: BenchmarkTask): GenerateRequest {
  const doc = typeof task.input === "string" ? task.input : "";
  return {
    model: "",
    system: SYSTEM,
    messages: [{ role: "user", content: `${doc}\n\n---\n\nQuestion: ${QUESTION}` }],
    params: { temperature: 0, maxTokens: 128 },
    metadata: {
      category: "long-context",
      contextTokens: (task.metadata?.tokens as number) ?? 0,
      simulation: { answer: task.expected ?? "", style: "number" },
    },
  };
}

export const longcontext = defineBenchmark({
  id: "long-context",
  name: "Long Context Retrieval",
  version: "1.0.0",
  category: "long-context",
  description: "Needle-in-a-haystack retrieval from ~10k and ~50k-token documents.",
  promptVersion: "longcontext-v1",
  metrics: ["retrievalAccuracy", "meanLatencyMs", "p95LatencyMs"],
  evaluator: { kind: "numeric", tolerance: 0 },
  defaultParams: { temperature: 0, maxTokens: 128 },
  tags: ["long-context", "retrieval"],
  tasks: makeLongContextTasks(DEFAULT_SPECS),
  buildRequest,
  parseOutput: (response) => ({
    raw: response.text,
    value: extractFinalNumber(response.text) ?? response.text.trim(),
  }),
});

export { makeLongContextTasks };
