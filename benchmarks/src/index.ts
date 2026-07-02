/**
 * @evalforge/benchmarks — concrete benchmark definitions and their sample data.
 *
 * Importing this package registers every built-in benchmark (GSM8K, MMLU, ARC,
 * TruthfulQA, HumanEval, Tool Use, Long Context) into the shared
 * `benchmarkRegistry`. Each benchmark is a single self-contained file; add one by
 * writing a new file and appending it to `registry.ts`.
 */

export * from "./lib/parse.js";
export * from "./lib/mcq.js";
export * from "./lib/define.js";
export * from "./registry.js";

export { gsm8k } from "./gsm8k.js";
export { mmlu } from "./mmlu.js";
export { arc } from "./arc.js";
export { truthfulqa } from "./truthfulqa.js";
export { humaneval } from "./humaneval.js";
export { tooluse } from "./tooluse.js";
export { longcontext, makeLongContextTasks } from "./longcontext.js";

export { GSM8K_TASKS } from "./data/gsm8k.js";
export { MMLU_TASKS } from "./data/mmlu.js";
export { ARC_TASKS } from "./data/arc.js";
export { TRUTHFULQA_TASKS } from "./data/truthfulqa.js";
export { HUMANEVAL_TASKS } from "./data/humaneval.js";
export { TOOLUSE_TASKS, TOOL_CATALOG } from "./data/tooluse.js";
export { DEFAULT_SPECS as LONGCONTEXT_DEFAULT_SPECS } from "./data/longcontext.js";
