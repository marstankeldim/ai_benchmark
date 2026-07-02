/**
 * Semantic-similarity judge. For free-form answers where exact match is too
 * strict ("12 dollars" vs "$12"), we compare embeddings of the answer and the
 * gold reference and pass when cosine similarity clears a threshold. The
 * embedding model is any provider that implements `embed()` — resolved lazily so
 * this file has no provider dependency.
 */

import { EvalForgeError } from "@evalforge/shared";
import type {
  Evaluator,
  GradeInput,
  GradeResult,
  ModelConfig,
  ModelProvider,
  SemanticSimilaritySpec,
} from "@evalforge/shared";

/** Resolve a live provider from an embedding model config (injected by the engine). */
export type ProviderResolver = (model: ModelConfig) => ModelProvider;

export class SemanticSimilarityEvaluator implements Evaluator {
  readonly kind = "semantic-similarity" as const;

  constructor(
    private readonly spec: SemanticSimilaritySpec,
    private readonly resolveProvider: ProviderResolver,
  ) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    if (task.expected === undefined) return { score: 0, passed: false, rationale: "no gold answer" };
    const provider = this.resolveProvider(this.spec.embeddingModel);
    if (!provider.embed) {
      throw new EvalForgeError(`provider ${provider.name} has no embeddings`, { code: "CONFIG" });
    }
    const { embeddings } = await provider.embed({
      model: this.spec.embeddingModel.model,
      input: [output.value, task.expected],
    });
    const sim = cosineSimilarity(embeddings[0]!, embeddings[1]!);
    const score = Math.max(0, Math.min(1, sim));
    const threshold = this.spec.threshold ?? 0.8;
    return {
      score,
      passed: score >= threshold,
      label: score >= threshold ? "similar" : "dissimilar",
      subScores: { cosine: sim },
      rationale: `cosine ${sim.toFixed(3)} vs threshold ${threshold}`,
    };
  }
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
