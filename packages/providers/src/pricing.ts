import type { Cost, ModelPricing, ProviderName, TokenUsage } from "@evalforge/shared";

/**
 * Published list prices (USD per 1M tokens) for the models we commonly evaluate.
 *
 * Keys are `"provider:model"`. Pricing changes often, so this is intentionally a
 * plain data table — the single place to edit when a vendor updates rates. An
 * unknown key yields `undefined` cost, which the engine treats as "unpriced"
 * rather than "free".
 */
export const PRICING: Record<string, ModelPricing> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  "openai:gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10, cachedInputPerMTok: 1.25 },
  "openai:gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6, cachedInputPerMTok: 0.075 },
  "openai:gpt-4.1": { inputPerMTok: 2, outputPerMTok: 8, cachedInputPerMTok: 0.5 },
  "openai:gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6, cachedInputPerMTok: 0.1 },
  "openai:gpt-4.1-nano": { inputPerMTok: 0.1, outputPerMTok: 0.4, cachedInputPerMTok: 0.025 },
  "openai:o3": { inputPerMTok: 2, outputPerMTok: 8, cachedInputPerMTok: 0.5 },
  "openai:o3-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4, cachedInputPerMTok: 0.55 },
  "openai:o4-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4, cachedInputPerMTok: 0.275 },
  "openai:o1": { inputPerMTok: 15, outputPerMTok: 60, cachedInputPerMTok: 7.5 },
  "openai:o1-mini": { inputPerMTok: 1.1, outputPerMTok: 4.4, cachedInputPerMTok: 0.55 },

  // ── Anthropic ───────────────────────────────────────────────────────────
  "anthropic:claude-opus-4-20250514": { inputPerMTok: 15, outputPerMTok: 75, cachedInputPerMTok: 1.5 },
  "anthropic:claude-sonnet-4-20250514": { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
  "anthropic:claude-3-7-sonnet-20250219": { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
  "anthropic:claude-3-5-sonnet-20241022": { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 },
  "anthropic:claude-3-5-haiku-20241022": { inputPerMTok: 0.8, outputPerMTok: 4, cachedInputPerMTok: 0.08 },
  "anthropic:claude-3-opus-20240229": { inputPerMTok: 15, outputPerMTok: 75, cachedInputPerMTok: 1.5 },
  "anthropic:claude-3-haiku-20240307": { inputPerMTok: 0.25, outputPerMTok: 1.25, cachedInputPerMTok: 0.03 },

  // ── Google (Gemini) ─────────────────────────────────────────────────────
  "google:gemini-2.0-flash": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  "google:gemini-2.0-flash-lite": { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "google:gemini-1.5-pro": { inputPerMTok: 1.25, outputPerMTok: 5 },
  "google:gemini-1.5-flash": { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "google:gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10 },
  "google:gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },

  // ── Groq (open models, hosted) ──────────────────────────────────────────
  "groq:llama-3.3-70b-versatile": { inputPerMTok: 0.59, outputPerMTok: 0.79 },
  "groq:llama-3.1-8b-instant": { inputPerMTok: 0.05, outputPerMTok: 0.08 },
  "groq:llama-3.1-70b-versatile": { inputPerMTok: 0.59, outputPerMTok: 0.79 },
  "groq:mixtral-8x7b-32768": { inputPerMTok: 0.24, outputPerMTok: 0.24 },
  "groq:gemma2-9b-it": { inputPerMTok: 0.2, outputPerMTok: 0.2 },
};

/** Build the `"provider:model"` key used throughout the pricing table. */
export function pricingKey(provider: ProviderName, model: string): string {
  return `${provider}:${model}`;
}

/** Look up published pricing for a model, or `undefined` if we have no rate. */
export function lookupPricing(provider: ProviderName, model: string): ModelPricing | undefined {
  return PRICING[pricingKey(provider, model)];
}

/**
 * Compute a `Cost` from a usage record and pricing. Cached prompt tokens (where
 * a discounted rate exists) are billed at the cheaper `cachedInputPerMTok`.
 */
export function computeCost(usage: TokenUsage, pricing: ModelPricing): Cost {
  const cached = usage.cachedTokens ?? 0;
  const uncachedPrompt = Math.max(0, usage.promptTokens - cached);
  const cachedRate = pricing.cachedInputPerMTok ?? pricing.inputPerMTok;

  const input =
    (uncachedPrompt * pricing.inputPerMTok + cached * cachedRate) / 1_000_000;
  const output = (usage.completionTokens * pricing.outputPerMTok) / 1_000_000;

  return { input, output, total: input + output, currency: "USD" };
}

/**
 * Estimate cost for a `provider:model` from the shared pricing table.
 * Returns `undefined` for models we do not have a rate for.
 */
export function estimateCostFor(
  provider: ProviderName,
  model: string,
  usage: TokenUsage,
): Cost | undefined {
  const pricing = lookupPricing(provider, model);
  return pricing ? computeCost(usage, pricing) : undefined;
}
