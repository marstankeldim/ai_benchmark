import { NotFoundError } from "./errors.js";
import type { Benchmark } from "./types/benchmark.js";
import type { ProviderFactory } from "./types/provider.js";
import type { EvaluatorFactory, EvaluatorKind } from "./types/evaluator.js";

/**
 * A tiny keyed registry. This is the mechanism behind the platform's core
 * promise: new providers/benchmarks/evaluators *register* themselves here rather
 * than being wired into the engine by hand.
 */
export class Registry<T> {
  private readonly items = new Map<string, T>();

  constructor(private readonly label: string) {}

  register(key: string, value: T, options: { overwrite?: boolean } = {}): this {
    if (this.items.has(key) && !options.overwrite) {
      throw new Error(`${this.label} "${key}" is already registered`);
    }
    this.items.set(key, value);
    return this;
  }

  get(key: string): T {
    const value = this.items.get(key);
    if (value === undefined) throw new NotFoundError(this.label, key);
    return value;
  }

  tryGet(key: string): T | undefined {
    return this.items.get(key);
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  keys(): string[] {
    return [...this.items.keys()];
  }

  list(): T[] {
    return [...this.items.values()];
  }

  entries(): Array<[string, T]> {
    return [...this.items.entries()];
  }

  get size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}

/**
 * Global registries. They are module singletons so that any package importing
 * `@evalforge/shared` shares the same instance: `@evalforge/benchmarks` fills
 * `benchmarkRegistry`, and `@evalforge/benchmark-engine` reads from it.
 */
export const benchmarkRegistry = new Registry<Benchmark>("benchmark");
export const providerRegistry = new Registry<ProviderFactory>("provider");
export const evaluatorRegistry = new Registry<EvaluatorFactory>("evaluator");

/** Convenience typed accessor for evaluator factories keyed by kind. */
export function registerEvaluator(kind: EvaluatorKind, factory: EvaluatorFactory): void {
  evaluatorRegistry.register(kind, factory, { overwrite: true });
}
