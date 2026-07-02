/**
 * Google Gemini provider over the `generateContent` REST endpoint. Gemini uses
 * `contents` with `parts`, folds the system prompt into `systemInstruction`, and
 * names the assistant role `model`. We translate to and from our neutral shape.
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

export const GOOGLE_DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const CAPABILITIES: ProviderCapabilities = {
  chat: true,
  tools: true,
  json: true,
  vision: true,
  embeddings: true,
  streaming: true,
  systemPrompt: true,
};

interface WirePart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
}
interface WireCandidate {
  content?: { parts?: WirePart[] };
  finishReason?: string;
}
interface WireResponse {
  candidates?: WireCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  modelVersion?: string;
}

class GoogleProvider implements ModelProvider {
  readonly name = "google" as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: ProviderConfig) {}

  async generate(request: GenerateRequest, options: CallOptions = {}): Promise<ModelResponse> {
    const p = request.params ?? {};
    const contents = request.messages
      .filter((m) => m.role !== "system")
      .map(toGeminiContent);
    const generationConfig: Record<string, unknown> = {};
    if (p.temperature !== undefined) generationConfig.temperature = p.temperature;
    if (p.topP !== undefined) generationConfig.topP = p.topP;
    if (p.topK !== undefined) generationConfig.topK = p.topK;
    if (p.maxTokens !== undefined) generationConfig.maxOutputTokens = p.maxTokens;
    if (p.stop && p.stop.length > 0) generationConfig.stopSequences = p.stop;
    if (request.responseFormat && request.responseFormat.type !== "text") {
      generationConfig.responseMimeType = "application/json";
      if (request.responseFormat.type === "json_schema") {
        generationConfig.responseSchema = request.responseFormat.schema;
      }
    }

    const system = collectSystem(request);
    const body: Record<string, unknown> = { contents };
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (request.tools && request.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: request.tools.map((t) => ({
            name: t.name,
            ...(t.description ? { description: t.description } : {}),
            parameters: t.parameters,
          })),
        },
      ];
    }

    const baseUrl = this.config.baseUrl ?? GOOGLE_DEFAULT_BASE_URL;
    const key = this.config.apiKey ?? "";
    const url = `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${key}`;
    const { data, latencyMs } = await postJson<WireResponse>(url, this.name, body, {
      headers: this.config.headers ?? {},
      ...(options.signal ? { signal: options.signal } : {}),
      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const text = parts.map((p2) => p2.text ?? "").join("");
    const toolCalls: ToolCall[] = parts
      .filter((p2) => p2.functionCall)
      .map((p2, i) => ({
        id: `call_${i}`,
        name: p2.functionCall?.name ?? "",
        arguments: (p2.functionCall?.args ?? {}) as ToolCall["arguments"],
      }));
    const usage = normalizeUsage(data.usageMetadata);

    return {
      id: "",
      provider: this.name,
      model: data.modelVersion ?? request.model,
      text,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      finishReason: mapFinish(candidate?.finishReason),
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

function partToGemini(part: ContentPart): unknown {
  switch (part.type) {
    case "text":
      return { text: part.text };
    case "image":
      return { fileData: { fileUri: part.url } };
    case "tool_result":
      return { text: part.content };
  }
}

function toGeminiContent(m: Message): unknown {
  const role = m.role === "assistant" ? "model" : "user";
  const parts =
    typeof m.content === "string" ? [{ text: m.content }] : m.content.map(partToGemini);
  return { role, parts };
}

function collectSystem(request: GenerateRequest): string | undefined {
  const parts: string[] = [];
  if (request.system) parts.push(request.system);
  for (const m of request.messages) {
    if (m.role === "system") {
      parts.push(typeof m.content === "string" ? m.content : "");
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function normalizeUsage(usage: WireResponse["usageMetadata"]): TokenUsage {
  const promptTokens = usage?.promptTokenCount ?? 0;
  const completionTokens = usage?.candidatesTokenCount ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage?.totalTokenCount ?? promptTokens + completionTokens,
    ...(usage?.cachedContentTokenCount !== undefined
      ? { cachedTokens: usage.cachedContentTokenCount }
      : {}),
  };
}

function mapFinish(reason: string | undefined): FinishReason {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    default:
      return reason ? "unknown" : "stop";
  }
}

export const createGoogleProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new GoogleProvider(config);

providerRegistry.register("google", createGoogleProvider, { overwrite: true });
