/**
 * MMLU — Massive Multitask Language Understanding. 57 subjects of 4-way multiple
 * choice; we ship a representative sample and grade with the choice evaluator.
 */

import { defineBenchmark } from "./lib/define.js";
import { mcqBuildRequest, mcqParseOutput } from "./lib/mcq.js";
import { MMLU_TASKS } from "./data/mmlu.js";

export const mmlu = defineBenchmark({
  id: "mmlu",
  name: "MMLU",
  version: "1.0.0",
  category: "knowledge",
  description: "Multiple-choice general knowledge across many academic subjects.",
  promptVersion: "mmlu-v1",
  metrics: ["accuracy", "meanLatencyMs", "totalCostUsd"],
  evaluator: { kind: "choice" },
  defaultParams: { temperature: 0, maxTokens: 512 },
  tags: ["knowledge", "multiple-choice"],
  tasks: MMLU_TASKS,
  buildRequest: (task) => mcqBuildRequest(task, "knowledge"),
  parseOutput: (response) => mcqParseOutput(response.text),
});
