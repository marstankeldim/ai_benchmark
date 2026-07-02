/**
 * HumanEval — functional-correctness coding benchmark. The model completes a
 * Python function from its signature and docstring; the code-exec evaluator runs
 * it against hidden assertions in a sandbox. Passing means the tests pass — no
 * partial credit — which is what makes pass@k meaningful across repeats.
 */

import type { BenchmarkTask } from "@evalforge/shared";
import { defineBenchmark } from "./lib/define.js";
import { extractCode } from "./lib/parse.js";
import { HUMANEVAL_TASKS } from "./data/humaneval.js";

const SYSTEM =
  "You are an expert Python programmer. Implement the requested function completely and " +
  "correctly. Respond with a single Python code block containing the full function definition.";

const solutionOf = (task: BenchmarkTask): string =>
  typeof task.metadata?.solution === "string" ? task.metadata.solution : "";

export const humaneval = defineBenchmark({
  id: "humaneval",
  name: "HumanEval",
  version: "1.0.0",
  category: "coding",
  description: "Python function-completion tasks graded by executing unit tests.",
  promptVersion: "humaneval-v1",
  metrics: ["pass@1", "pass@k", "compilationSuccess", "meanLatencyMs"],
  evaluator: { kind: "code-exec", language: "python", testsFrom: "reference", timeoutMs: 8000, passK: [1] },
  defaultParams: { temperature: 0.2, maxTokens: 1024 },
  tags: ["coding", "python", "execution"],
  tasks: HUMANEVAL_TASKS,
  buildRequest: (task) => ({
    model: "",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${typeof task.input === "string" ? task.input : ""}\n\nProvide the complete implementation.`,
      },
    ],
    params: { temperature: 0.2, maxTokens: 1024 },
    metadata: { category: "coding", simulation: { answer: solutionOf(task), style: "code" } },
  }),
  parseOutput: (response) => ({ raw: response.text, value: extractCode(response.text) }),
});
