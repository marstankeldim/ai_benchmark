import type { JsonObject, JsonValue, Metadata } from "./common.js";

/**
 * Known provider identifiers. The `(string & {})` member keeps the union open
 * so a third-party provider can register a new name without editing this file.
 */
export type ProviderName =
  | "openai"
  | "anthropic"
  | "google"
  | "openrouter"
  | "groq"
  | "ollama"
  | "mock"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

export type Role = "system" | "user" | "assistant" | "tool";

/** Multimodal content parts. Text-only prompts may use a plain string. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; url: string; detail?: "low" | "high" | "auto" }
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean };

export interface Message {
  role: Role;
  content: string | ContentPart[];
  /** Present on assistant turns that call tools. */
  toolCalls?: ToolCall[];
  /** Present on `tool` messages: which call this responds to. */
  toolCallId?: string;
  name?: string;
}

// ── Tool use ────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description?: string;
  /** JSON Schema for the tool's parameters. */
  parameters: JsonObject;
}

export type ToolChoice = "auto" | "none" | "required" | { name: string };

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments if valid JSON, else the raw string in `argumentsRaw`. */
  arguments: JsonValue;
  argumentsRaw?: string;
}

// ── Sampling / response shape ─────────────────────────────────────────────────

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; schema: JsonObject; name?: string; strict?: boolean };

export interface SamplingParams {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stop?: string[];
  /** Seed for providers that support deterministic sampling. */
  seed?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  /** Extended-thinking / reasoning budget hint where supported. */
  reasoningEffort?: "low" | "medium" | "high";
}

// ── Requests ──────────────────────────────────────────────────────────────────

export interface GenerateRequest {
  model: string;
  messages: Message[];
  /** Convenience system prompt; merged ahead of `messages` by providers. */
  system?: string;
  params?: SamplingParams;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
  responseFormat?: ResponseFormat;
  metadata?: Metadata;
}

export interface EmbedRequest {
  model: string;
  input: string | string[];
}

// ── Responses ────────────────────────────────────────────────────────────────

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Reasoning/thinking tokens billed separately by some providers. */
  reasoningTokens?: number;
  /** Prompt tokens served from the provider's cache. */
  cachedTokens?: number;
}

export interface Cost {
  input: number;
  output: number;
  total: number;
  currency: "USD";
}

export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "unknown";

export interface ModelResponse {
  id: string;
  provider: ProviderName;
  model: string;
  /** The assistant's text output (empty string if the turn was tool-only). */
  text: string;
  toolCalls?: ToolCall[];
  finishReason: FinishReason;
  usage: TokenUsage;
  cost?: Cost;
  /** Wall-clock latency of the provider call, in milliseconds. */
  latencyMs: number;
  /** Whether this response was served from EvalForge's cache. */
  cached?: boolean;
  /** Raw provider payload, retained for full reproducibility/debugging. */
  raw?: JsonValue;
}

export interface EmbedResponse {
  model: string;
  embeddings: number[][];
  usage: TokenUsage;
}

// ── Model & provider metadata ────────────────────────────────────────────────

export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  cachedInputPerMTok?: number;
}

export interface ProviderCapabilities {
  chat: boolean;
  tools: boolean;
  json: boolean;
  vision: boolean;
  embeddings: boolean;
  streaming: boolean;
  systemPrompt: boolean;
}

export type Modality = "text" | "image" | "audio";

export interface ModelInfo {
  id: string;
  provider: ProviderName;
  displayName?: string;
  contextWindow: number;
  maxOutputTokens?: number;
  pricing?: ModelPricing;
  modalities?: Modality[];
}

/** A fully-specified model to evaluate: provider + model id + how to sample it. */
export interface ModelConfig {
  provider: ProviderName;
  model: string;
  params?: SamplingParams;
  /** Human-friendly label used in reports/leaderboards (defaults to model id). */
  label?: string;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  /** Default request timeout for this provider, in ms. */
  timeoutMs?: number;
  organization?: string;
  metadata?: Metadata;
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

// ── The core contract ─────────────────────────────────────────────────────────

/**
 * The single interface every model provider implements. Adding a provider means
 * writing one file that exports an implementation and registers a factory —
 * nothing else in the codebase changes.
 */
export interface ModelProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;
  /** Perform one generation. Implementations own retries only for transport-level concerns; the engine handles run-level retry/backoff. */
  generate(request: GenerateRequest, options?: CallOptions): Promise<ModelResponse>;
  /** Optional: embeddings for semantic-similarity judging. */
  embed?(request: EmbedRequest, options?: CallOptions): Promise<EmbedResponse>;
  /** Estimate cost for a usage record on a given model. */
  estimateCost(usage: TokenUsage, model: string): Cost | undefined;
  /** Optional: enumerate available models. */
  listModels?(): Promise<ModelInfo[]>;
}

/** Factory registered per provider name; receives resolved config. */
export type ProviderFactory = (config: ProviderConfig) => ModelProvider;
