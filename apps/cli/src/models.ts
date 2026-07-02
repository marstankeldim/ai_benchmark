/**
 * Parse a `provider:model` CLI spec into a {@link ModelConfig}. The first colon
 * splits provider from model id, so `mock:balanced`, `openai:gpt-4o`, and
 * `anthropic:claude-sonnet-4-20250514` all parse correctly. Sampling flags
 * (temperature, seed, max tokens) are folded in.
 */

import { ConfigError } from "@evalforge/shared";
import type { ModelConfig, SamplingParams } from "@evalforge/shared";

export function parseModelSpec(spec: string, params?: SamplingParams): ModelConfig {
  const colon = spec.indexOf(":");
  if (colon <= 0 || colon === spec.length - 1) {
    throw new ConfigError(
      `Invalid model "${spec}". Use "provider:model", e.g. "mock:balanced" or "openai:gpt-4o".`,
    );
  }
  const provider = spec.slice(0, colon);
  const model = spec.slice(colon + 1);
  return {
    provider,
    model,
    label: spec,
    ...(params && Object.keys(params).length > 0 ? { params } : {}),
  };
}
