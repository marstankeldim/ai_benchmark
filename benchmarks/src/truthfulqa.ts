/**
 * TruthfulQA — measures whether a model avoids popular misconceptions. Each item
 * pits the truthful answer against a common false belief; accuracy here doubles
 * as a (1 − hallucination-rate) proxy on adversarial questions.
 */

import { defineBenchmark } from "./lib/define.js";
import { mcqBuildRequest, mcqParseOutput } from "./lib/mcq.js";
import { TRUTHFULQA_TASKS } from "./data/truthfulqa.js";

export const truthfulqa = defineBenchmark({
  id: "truthfulqa",
  name: "TruthfulQA",
  version: "1.0.0",
  category: "reasoning",
  description: "Adversarial questions targeting common human misconceptions.",
  promptVersion: "truthfulqa-v1",
  metrics: ["accuracy", "hallucinationRate", "meanLatencyMs"],
  evaluator: { kind: "choice" },
  defaultParams: { temperature: 0, maxTokens: 512 },
  tags: ["reasoning", "truthfulness", "safety"],
  tasks: TRUTHFULQA_TASKS,
  buildRequest: (task) => mcqBuildRequest(task, "reasoning"),
  parseOutput: (response) => mcqParseOutput(response.text),
});
