/**
 * @evalforge/evaluators — the judge system.
 *
 * A judge implements one method: `grade(input) → GradeResult` with a score in
 * [0, 1]. Built-ins span deterministic checks (exact/regex/numeric/includes/
 * choice/json-schema), embedding-based semantic similarity, LLM-as-judge, and
 * sandboxed code execution, plus a weighted composite. `buildEvaluator(spec, ctx)`
 * turns a stored spec into a live judge; custom judges register in the shared
 * `evaluatorRegistry`.
 */

export * from "./normalize.js";
export * from "./json-schema.js";
export * from "./deterministic.js";
export * from "./semantic.js";
export * from "./llm-judge.js";
export * from "./sandbox.js";
export * from "./code-exec.js";
export * from "./composite.js";
export * from "./factory.js";
