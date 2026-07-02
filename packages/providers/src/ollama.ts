/**
 * Ollama provider for locally-hosted open models. Talks to Ollama's native
 * `/api/chat` endpoint (non-streaming) so it needs no cloud credentials — just a
 * running `ollama serve`. Local models are free, so cost is always zero.
 */

import type {
  CallOptions,
  ContentPart,
  Cost,
  FinishReason,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  ProviderCapabilities,
  ProviderConfig,
  ProviderFactory,
  TokenUsage,
} from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";
import { postJson } from "./http.js";

export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434";

const CAPABILITIES: ProviderCapabilities = {
  chat: true,
  tools: true,
  json: true,
  vision: true,
  embeddings: true,
  streaming: true,
  systemPrompt: true,
};

interface WireResponse {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

class OllamaProvider implements ModelProvider {
  readonly name = "ollama" as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: ProviderConfig) {}

  async generate(request: GenerateRequest, options: CallOptions = {}): Promise<ModelResponse> {
    const p = request.params ?? {};
    const messages: unknown[] = [];
    if (request.system) messages.push({ role: "system", content: request.system });
    for (const m of request.messages) messages.push(toOllama(m));

    const optionsBlock: Record<string, unknown> = {};
    if (p.temperature !== undefined) optionsBlock.temperature = p.temperature;
    if (p.topP !== undefined) optionsBlock.top_p = p.topP;
    if (p.topK !== undefined) optionsBlock.top_k = p.topK;
    if (p.maxTokens !== undefined) optionsBlock.num_predict = p.maxTokens;
    if (p.seed !== undefined) optionsBlock.seed = p.seed;
    if (p.stop && p.stop.length > 0) optionsBlock.stop = p.stop;

    const body: Record<string, unknown> = { model: request.model, messages, stream: false };
    if (Object.keys(optionsBlock).length > 0) body.options = optionsBlock;
    if (request.responseFormat && request.responseFormat.type !== "text") {
      body.format = request.responseFormat.type === "json_schema" ? request.responseFormat.schema : "json";
    }

    const { data, latencyMs } = await postJson<WireResponse>(
      `${this.config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL}/api/chat`,
      this.name,
      body,
      {
        headers: this.config.headers ?? {},
        ...(options.signal ? { signal: options.signal } : {}),
        timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
      },
    );

    const usage = normalizeUsage(data);
    return {
      id: "",
      provider: this.name,
      model: data.model ?? request.model,
      text: data.message?.content ?? "",
      finishReason: mapFinish(data.done_reason),
      usage,
      cost: { input: 0, output: 0, total: 0, currency: "USD" },
      latencyMs,
      raw: data as unknown as ModelResponse["raw"],
    };
  }

  /** Local models are free. */
  estimateCost(): Cost {
    return { input: 0, output: 0, total: 0, currency: "USD" };
  }
}

function toOllama(m: Message): unknown {
  const content =
    typeof m.content === "string"
      ? m.content
      : m.content.map((part: ContentPart) => (part.type === "text" ? part.text : "")).join("");
  return { role: m.role === "tool" ? "tool" : m.role, content };
}

function normalizeUsage(data: WireResponse): TokenUsage {
  const promptTokens = data.prompt_eval_count ?? 0;
  const completionTokens = data.eval_count ?? 0;
  return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
}

function mapFinish(reason: string | undefined): FinishReason {
  if (reason === "stop") return "stop";
  if (reason === "length") return "length";
  return reason ? "unknown" : "stop";
}

export const createOllamaProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new OllamaProvider(config);

providerRegistry.register("ollama", createOllamaProvider, { overwrite: true });
