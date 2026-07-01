import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Resolve a path relative to this config file into an absolute path. */
const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

/**
 * Root Vitest config for the whole monorepo. Tests live next to the code they
 * exercise as `*.test.ts`. We alias every workspace package to its `src` entry
 * so tests run against source (no build step) with the same import specifiers
 * the production code uses.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@evalforge/shared": r("./packages/shared/src/index.ts"),
      "@evalforge/providers": r("./packages/providers/src/index.ts"),
      "@evalforge/datasets": r("./packages/datasets/src/index.ts"),
      "@evalforge/scoring": r("./packages/scoring/src/index.ts"),
      "@evalforge/evaluators": r("./packages/evaluators/src/index.ts"),
      "@evalforge/benchmark-engine": r("./packages/benchmark-engine/src/index.ts"),
      "@evalforge/reporting": r("./packages/reporting/src/index.ts"),
      "@evalforge/db": r("./packages/db/src/index.ts"),
      "@evalforge/benchmarks": r("./benchmarks/src/index.ts"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/web/**"],
    environment: "node",
  },
});
