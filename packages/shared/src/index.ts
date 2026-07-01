/**
 * @evalforge/shared — the contract package.
 *
 * Everything else in EvalForge depends on this and only this for its domain
 * vocabulary. It contains: the domain types, the four core interfaces
 * (`ModelProvider`, `Evaluator`, `RunStore`, `ResponseCache`), the registries
 * that make the platform open for extension, and pure utilities. It has no
 * dependency on any other workspace package.
 */

export * from "./types/index.js";
export * from "./utils/index.js";
export * from "./errors.js";
export * from "./registry.js";
export * from "./config.js";
