/**
 * GSM8K — grade-school math word problems requiring multi-step arithmetic
 * reasoning. The model is asked to show its work and end with `#### <answer>`;
 * grading is numeric (tolerant of formatting) on the extracted final number.
 */

import { defineBenchmark } from "./lib/define.js";
import { extractFinalNumber } from "./lib/parse.js";
import { GSM8K_TASKS } from "./data/gsm8k.js";

const SYSTEM =
  "Solve the math word problem. Think step by step, then give the final numeric answer " +
  "on its own line in the form '#### <number>'.";

export const gsm8k = defineBenchmark({
  id: "gsm8k",
  name: "GSM8K",
  version: "1.0.0",
  category: "math",
  description: "Grade-school arithmetic word problems with numeric answers.",
  promptVersion: "gsm8k-v1",
  metrics: ["accuracy", "exactMatch", "tokenEfficiency", "meanLatencyMs"],
  evaluator: { kind: "numeric", tolerance: 1e-4, relativeTolerance: 1e-4 },
  defaultParams: { temperature: 0, maxTokens: 1024 },
  tags: ["math", "reasoning", "chain-of-thought"],
  tasks: GSM8K_TASKS,
  buildRequest: (task) => ({
    model: "",
    system: SYSTEM,
    messages: [{ role: "user", content: typeof task.input === "string" ? task.input : "" }],
    params: { temperature: 0, maxTokens: 1024 },
    metadata: { category: "math", simulation: { answer: task.expected ?? "", style: "number" } },
  }),
  parseOutput: (response) => ({
    raw: response.text,
    value: extractFinalNumber(response.text) ?? response.text.trim(),
  }),
});
