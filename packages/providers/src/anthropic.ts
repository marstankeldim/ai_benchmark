/**
 * Anthropic provider over the Messages API. Anthropic differs from OpenAI in two
 * ways that matter here: the system prompt is a top-level field (not a message),
 * and content is always a list of typed blocks. We translate our neutral
 * `GenerateRequest` into that shape and normalize the response back.
 */

import type {
  CallOptions,
  ContentPart,
  FinishReason,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  ProviderCapabilities,
  ProviderConfig,
  ProviderFactory,
  ToolCall,
  TokenUsage,
} from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";
import { postJson } from "./http.js";
import { estimateCostFor } from "./pricing.js";

export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

const CAPABILITIES: ProviderCapabilities = {
  chat: true,
  tools: true,
  json: false,
  vision: true,
  embeddings: false,
  streaming: true,
  systemPrompt: true,
};

interface WireContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

interface WireMessage {
  id?: string;
  model?: string;
  content?: WireContentBlock[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}

class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic" as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: ProviderConfig) {}

  async generate(request: GenerateRequest, options: CallOptions = {}): Promise<ModelResponse> {
    const p = request.params ?? {};
    const { system, messages } = splitSystem(request);
    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      // Anthropic requires max_tokens; default to a generous cap.
      max_tokens: p.maxTokens ?? 4096,
    };
    if (system) body.system = system;
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (p.topP !== undefined) body.top_p = p.topP;
    if (p.topK !== undefined) body.top_k = p.topK;
    if (p.stop && p.stop.length > 0) body.stop_sequences = p.stop;
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        ...(t.description ? { description: t.description } : {}),
        input_schema: t.parameters,
      }));
    }

    const { data, latencyMs } = await postJson<WireMessage>(
      `${this.config.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL}/v1/messages`,
      this.name,
      body,
      {
        headers: {
          "anthropic-version": ANTHROPIC_VERSION,
          ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {}),
          ...this.config.headers,
        },
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
      },
    );

    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const toolCalls: ToolCall[] = (data.content ?? [])
      .filter((b) => b.type === "tool_use")
      .map((b, i) => ({
        id: b.id ?? `call_${i}`,
        name: b.name ?? "",
        arguments: (b.input ?? {}) as ToolCall["arguments"],
      }));
    const usage = normalizeUsage(data.usage);

    return {
      id: data.id ?? "",
      provider: this.name,
      model: data.model ?? request.model,
      text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      finishReason: mapStop(data.stop_reason),
      usage,
      ...(this.estimateCost(usage, request.model)
        ? { cost: this.estimateCost(usage, request.model) }
        : {}),
      latencyMs,
      raw: data as unknown as ModelResponse["raw"],
    };
  }

  estimateCost(usage: TokenUsage, model: string) {
    return estimateCostFor(this.name, model, usage);
  }
}

function partToAnthropic(part: ContentPart): unknown {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image", source: { type: "url", url: part.url } };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: part.toolCallId,
        content: part.content,
        ...(part.isError ? { is_error: true } : {}),
      };
  }
}

function splitSystem(request: GenerateRequest): { system?: string; messages: unknown[] } {
  const systemParts: string[] = [];
  if (request.system) systemParts.push(request.system);
  const messages: unknown[] = [];
  for (const m of request.messages) {
    if (m.role === "system") {
      systemParts.push(typeof m.content === "string" ? m.content : flatten(m.content));
      continue;
    }
    messages.push(convert(m));
  }
  return { ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}), messages };
}

function convert(m: Message): unknown {
  const role = m.role === "assistant" ? "assistant" : "user";
  if (m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.toolCalls.map((tc) => ({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments ?? {},
      })),
    };
  }
  const content =
    typeof m.content === "string" ? m.content : m.content.map(partToAnthropic);
  return { role, content };
}

function flatten(parts: ContentPart[]): string {
  return parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

function normalizeUsage(usage: WireMessage["usage"]): TokenUsage {
  const promptTokens = usage?.input_tokens ?? 0;
  const completionTokens = usage?.output_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    ...(usage?.cache_read_input_tokens !== undefined
      ? { cachedTokens: usage.cache_read_input_tokens }
      : {}),
  };
}

function mapStop(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    default:
      return reason ? "unknown" : "stop";
  }
}

export const createAnthropicProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new AnthropicProvider(config);

providerRegistry.register("anthropic", createAnthropicProvider, { overwrite: true });
