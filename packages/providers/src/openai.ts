/**
 * OpenAI provider. Chat Completions + embeddings over the OpenAI-compatible base.
 * Adding OpenAI required exactly this one file — the "one file per provider"
 * promise in action.
 */

import type { ProviderConfig, ProviderFactory } from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";
import { OpenAICompatibleProvider } from "./base-openai.js";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

export const createOpenAIProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new OpenAICompatibleProvider({
    name: "openai",
    baseUrl: config.baseUrl ?? OPENAI_DEFAULT_BASE_URL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.organization ? { organization: config.organization } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    embeddings: true,
  });

providerRegistry.register("openai", createOpenAIProvider, { overwrite: true });
