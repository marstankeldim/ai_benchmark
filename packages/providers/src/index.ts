/**
 * @evalforge/providers — one uniform `ModelProvider` interface over every vendor,
 * built on `fetch` (no SDK lock-in). Importing this package registers all
 * built-in providers, so `createProvider(name)` works immediately.
 *
 * Add a vendor by writing one file that constructs a `ModelProvider` and calls
 * `providerRegistry.register(name, factory)` — nothing else changes.
 */

// Base + shared machinery.
export * from "./pricing.js";
export * from "./http.js";
export * from "./base-openai.js";
export * from "./factory.js";

// Concrete providers (each self-registers on import).
export { createOpenAIProvider, OPENAI_DEFAULT_BASE_URL } from "./openai.js";
export { createOpenRouterProvider, OPENROUTER_DEFAULT_BASE_URL } from "./openrouter.js";
export { createGroqProvider, GROQ_DEFAULT_BASE_URL } from "./groq.js";
export { createAnthropicProvider, ANTHROPIC_DEFAULT_BASE_URL } from "./anthropic.js";
export { createGoogleProvider, GOOGLE_DEFAULT_BASE_URL } from "./google.js";
export { createOllamaProvider, OLLAMA_DEFAULT_BASE_URL } from "./ollama.js";
export { createMockProvider } from "./mock.js";

// Ensure side-effectful registration runs even if only the index is imported.
import "./openai.js";
import "./openrouter.js";
import "./groq.js";
import "./anthropic.js";
import "./google.js";
import "./ollama.js";
import "./mock.js";
