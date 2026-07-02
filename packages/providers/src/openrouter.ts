/**
 * OpenRouter provider — a single OpenAI-compatible gateway to hundreds of models
 * across vendors. The optional referer/title headers are OpenRouter conventions
 * used for attribution on their dashboard.
 */

import type { ProviderConfig, ProviderFactory } from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";
import { OpenAICompatibleProvider } from "./base-openai.js";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

export const createOpenRouterProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new OpenAICompatibleProvider({
    name: "openrouter",
    baseUrl: config.baseUrl ?? OPENROUTER_DEFAULT_BASE_URL,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    headers: {
      "HTTP-Referer": "https://github.com/evalforge/evalforge",
      "X-Title": "EvalForge",
      ...config.headers,
    },
    ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
  });

providerRegistry.register("openrouter", createOpenRouterProvider, { overwrite: true });
