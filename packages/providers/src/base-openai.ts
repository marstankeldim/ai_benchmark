/**
 * The OpenAI Chat Completions wire format is a de-facto standard: OpenAI,
 * OpenRouter, Groq, Together, Fireworks, and many local servers all speak it.
 * This base implements the whole `ModelProvider` contract against that format so
 * each concrete vendor file is just a few lines of configuration.
 */

import { ProviderError } from "@evalforge/shared";
import type {
  CallOptions,
  ContentPart,
  EmbedRequest,
  EmbedResponse,
  FinishReason,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  ProviderCapabilities,
  ProviderName,
  ResponseFormat,
  ToolCall,
  ToolChoice,
  ToolDefinition,
  TokenUsage,
} from "@evalforge/shared";
import { safeJsonParse } from "@evalforge/shared";
import { postJson } from "./http.js";
import { estimateCostFor } from "./pricing.js";

const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  tools: true,
  json: true,
  vision: true,
  embeddings: false,
  streaming: true,
  systemPrompt: true,
};

export interface OpenAICompatConfig {
  name: ProviderName;
  baseUrl: string;
  apiKey?: string;
  /** Extra headers (e.g. OpenRouter's referer/title). */
  headers?: Record<string, string>;
  organization?: string;
  timeoutMs?: number;
  capabilities?: Partial<ProviderCapabilities>;
  /** Some reasoning models require `max_completion_tokens` instead of `max_tokens`. */
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  /** Embeddings model support (OpenAI yes; Groq/OpenRouter no). */
  embeddings?: boolean;
}

// ── Wire types (only the fields we read) ──────────────────────────────────────

interface WireToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface WireChoice {
  message?: { content?: string | null; tool_calls?: WireToolCall[] };
  finish_reason?: string | null;
}

interface WireUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface WireCompletion {
  id?: string;
  model?: string;
  choices?: WireChoice[];
  usage?: WireUsage;
}

interface WireEmbeddings {
  data?: Array<{ embedding: number[] }>;
  usage?: WireUsage;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name: ProviderName;
  readonly capabilities: ProviderCapabilities;

  constructor(private readonly cfg: OpenAICompatConfig) {
    this.name = cfg.name;
    this.capabilities = {
      ...DEFAULT_CAPABILITIES,
      embeddings: cfg.embeddings ?? false,
      ...cfg.capabilities,
    };
  }

  private authHeaders(): Record<string, string> {
    return {
      ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}),
      ...(this.cfg.organization ? { "openai-organization": this.cfg.organization } : {}),
      ...this.cfg.headers,
    };
  }

  async generate(request: GenerateRequest, options: CallOptions = {}): Promise<ModelResponse> {
    const body = this.buildBody(request);
    const { data, latencyMs } = await postJson<WireCompletion>(
      `${this.cfg.baseUrl}/chat/completions`,
      this.name,
      body,
      {
        headers: this.authHeaders(),
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? this.cfg.timeoutMs,
      },
    );

    const choice = data.choices?.[0];
    const usage = normalizeUsage(data.usage);
    const toolCalls = parseToolCalls(choice?.message?.tool_calls);
    return {
      id: data.id ?? "",
      provider: this.name,
      model: data.model ?? request.model,
      text: choice?.message?.content ?? "",
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      finishReason: mapFinish(choice?.finish_reason),
      usage,
      ...(this.estimateCost(usage, request.model)
        ? { cost: this.estimateCost(usage, request.model) }
        : {}),
      latencyMs,
      raw: data as unknown as ModelResponse["raw"],
    };
  }

  async embed(request: EmbedRequest, options: CallOptions = {}): Promise<EmbedResponse> {
    if (!this.capabilities.embeddings) {
      throw new ProviderError(String(this.name), "does not support embeddings");
    }
    const { data } = await postJson<WireEmbeddings>(`${this.cfg.baseUrl}/embeddings`, this.name, {
      model: request.model,
      input: request.input,
    }, {
      headers: this.authHeaders(),
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: options.timeoutMs ?? this.cfg.timeoutMs,
    });
    return {
      model: request.model,
      embeddings: (data.data ?? []).map((d) => d.embedding),
      usage: normalizeUsage(data.usage),
    };
  }

  estimateCost(usage: TokenUsage, model: string) {
    return estimateCostFor(this.name, model, usage);
  }

  private buildBody(request: GenerateRequest): Record<string, unknown> {
    const p = request.params ?? {};
    const maxField = this.cfg.maxTokensField ?? "max_tokens";
    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAIMessages(request),
    };
    if (p.temperature !== undefined) body.temperature = p.temperature;
    if (p.topP !== undefined) body.top_p = p.topP;
    if (p.maxTokens !== undefined) body[maxField] = p.maxTokens;
    if (p.stop && p.stop.length > 0) body.stop = p.stop;
    if (p.seed !== undefined) body.seed = p.seed;
    if (p.frequencyPenalty !== undefined) body.frequency_penalty = p.frequencyPenalty;
    if (p.presencePenalty !== undefined) body.presence_penalty = p.presencePenalty;
    if (p.reasoningEffort !== undefined) body.reasoning_effort = p.reasoningEffort;
    if (request.tools && request.tools.length > 0) body.tools = request.tools.map(toOpenAITool);
    if (request.toolChoice !== undefined) body.tool_choice = toOpenAIToolChoice(request.toolChoice);
    if (request.responseFormat) body.response_format = toOpenAIResponseFormat(request.responseFormat);
    return body;
  }
}

// ── Conversions ───────────────────────────────────────────────────────────────

function partToOpenAI(part: ContentPart): unknown {
  switch (part.type) {
    case "text":
      return { type: "text", text: part.text };
    case "image":
      return { type: "image_url", image_url: { url: part.url, detail: part.detail ?? "auto" } };
    case "tool_result":
      return { type: "text", text: part.content };
  }
}

export function toOpenAIMessages(request: GenerateRequest): unknown[] {
  const out: unknown[] = [];
  if (request.system) out.push({ role: "system", content: request.system });
  for (const m of request.messages) out.push(convertMessage(m));
  return out;
}

function convertMessage(m: Message): unknown {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.toolCallId ?? "",
      content: typeof m.content === "string" ? m.content : m.content.map(partToOpenAI),
    };
  }
  const base: Record<string, unknown> = {
    role: m.role,
    content: typeof m.content === "string" ? m.content : m.content.map(partToOpenAI),
  };
  if (m.name) base.name = m.name;
  if (m.toolCalls && m.toolCalls.length > 0) {
    base.tool_calls = m.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: tc.argumentsRaw ?? JSON.stringify(tc.arguments ?? {}),
      },
    }));
  }
  return base;
}

function toOpenAITool(tool: ToolDefinition): unknown {
  return {
    type: "function",
    function: {
      name: tool.name,
      ...(tool.description ? { description: tool.description } : {}),
      parameters: tool.parameters,
    },
  };
}

function toOpenAIToolChoice(choice: ToolChoice): unknown {
  if (typeof choice === "string") return choice;
  return { type: "function", function: { name: choice.name } };
}

function toOpenAIResponseFormat(format: ResponseFormat): unknown {
  if (format.type === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: format.name ?? "response",
        schema: format.schema,
        ...(format.strict !== undefined ? { strict: format.strict } : {}),
      },
    };
  }
  return { type: format.type };
}

export function parseToolCalls(raw: WireToolCall[] | undefined): ToolCall[] {
  if (!raw) return [];
  return raw.map((tc, i) => {
    const argsRaw = tc.function?.arguments ?? "";
    const parsed = safeJsonParse(argsRaw);
    return {
      id: tc.id ?? `call_${i}`,
      name: tc.function?.name ?? "",
      arguments: parsed ?? argsRaw,
      argumentsRaw: argsRaw,
    };
  });
}

export function normalizeUsage(usage: WireUsage | undefined): TokenUsage {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.total_tokens ?? promptTokens + completionTokens,
    ...(usage?.prompt_tokens_details?.cached_tokens !== undefined
      ? { cachedTokens: usage.prompt_tokens_details.cached_tokens }
      : {}),
    ...(usage?.completion_tokens_details?.reasoning_tokens !== undefined
      ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
      : {}),
  };
}

export function mapFinish(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
    case "max_tokens":
      return "length";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    default:
      return reason ? "unknown" : "stop";
  }
}
