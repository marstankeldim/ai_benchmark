/**
 * Provider construction from names + environment. Importing this module (via the
 * package index) has the side effect of registering every built-in provider
 * factory, after which `createProvider("openai")` resolves credentials from the
 * environment and returns a ready `ModelProvider`.
 */

import { ConfigError, providerRegistry } from "@evalforge/shared";
import type { ModelProvider, ProviderConfig, ProviderName } from "@evalforge/shared";

/** Per-provider environment variable names for keys and base URLs. */
const ENV_KEYS: Record<string, { key?: string; baseUrl?: string }> = {
  openai: { key: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL" },
  anthropic: { key: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL" },
  google: { key: "GOOGLE_API_KEY", baseUrl: "GOOGLE_BASE_URL" },
  openrouter: { key: "OPENROUTER_API_KEY", baseUrl: "OPENROUTER_BASE_URL" },
  groq: { key: "GROQ_API_KEY", baseUrl: "GROQ_BASE_URL" },
  ollama: { baseUrl: "OLLAMA_BASE_URL" },
  mock: {},
};

/** Resolve a provider's config from the environment, allowing overrides. */
export function resolveProviderConfig(
  name: ProviderName,
  env: NodeJS.ProcessEnv = process.env,
  overrides: ProviderConfig = {},
): ProviderConfig {
  const spec = ENV_KEYS[name] ?? {};
  const apiKey = overrides.apiKey ?? (spec.key ? env[spec.key] : undefined);
  const baseUrl = overrides.baseUrl ?? (spec.baseUrl ? env[spec.baseUrl] : undefined);
  return {
    ...overrides,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}

/**
 * Build a provider by name. Throws a clear {@link ConfigError} if the name is not
 * registered (rather than the registry's generic not-found), since this is a
 * common user-facing mistake.
 */
export function createProvider(
  name: ProviderName,
  overrides: ProviderConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): ModelProvider {
  const factory = providerRegistry.tryGet(name);
  if (!factory) {
    throw new ConfigError(
      `Unknown provider "${name}". Registered: ${providerRegistry.keys().join(", ")}`,
    );
  }
  return factory(resolveProviderConfig(name, env, overrides));
}

/** All registered provider names. */
export function availableProviders(): string[] {
  return providerRegistry.keys();
}
