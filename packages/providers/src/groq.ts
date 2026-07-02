/**
 * Groq provider — OpenAI-compatible API serving open models (Llama, Mixtral,
 * Gemma) on their LPU hardware at very high throughput.
 */

import type { ProviderConfig, ProviderFactory } from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";
import { OpenAICompatibleProvider } from "./base-openai.js";

export const GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

export const createGroqProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new OpenAICompatibleProvider({
    name: "groq",
    baseUrl: config.baseUrl ?? GROQ_DEFAULT_BASE_URL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
    capabilities: { vision: false },
  });

providerRegistry.register("groq", createGroqProvider, { overwrite: true });
