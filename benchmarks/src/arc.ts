/**
 * ARC — the AI2 Reasoning Challenge. Grade-school science questions requiring
 * more than surface pattern-matching. Graded by the choice evaluator.
 */

import { defineBenchmark } from "./lib/define.js";
import { mcqBuildRequest, mcqParseOutput } from "./lib/mcq.js";
import { ARC_TASKS } from "./data/arc.js";

export const arc = defineBenchmark({
  id: "arc",
  name: "ARC (Challenge)",
  version: "1.0.0",
  category: "reasoning",
  description: "Grade-school-level science reasoning, multiple choice.",
  promptVersion: "arc-v1",
  metrics: ["accuracy", "meanLatencyMs", "totalCostUsd"],
  evaluator: { kind: "choice" },
  defaultParams: { temperature: 0, maxTokens: 512 },
  tags: ["reasoning", "science", "multiple-choice"],
  tasks: ARC_TASKS,
  buildRequest: (task) => mcqBuildRequest(task, "reasoning"),
  parseOutput: (response) => mcqParseOutput(response.text),
});
