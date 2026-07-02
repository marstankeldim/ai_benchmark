/**
 * The deterministic Mock provider — the reason EvalForge runs end-to-end with no
 * network, no keys, and no flakiness.
 *
 * It is fully reproducible: the same request always yields the same response,
 * because every "random" decision is drawn from a seeded RNG keyed on the request
 * content. Yet it is not trivial — a `mock:strong` model genuinely outscores a
 * `mock:weak` one — because benchmarks may attach a *simulation hint* to the
 * request metadata under `metadata.simulation`. Real providers ignore unknown
 * metadata; the mock reads it to decide, per persona, whether to answer correctly
 * and in what shape (a choice letter, a number, a code block, or free text).
 *
 * This keeps the whole pipeline honest: nothing is special-cased in the engine,
 * and the hint travels only in metadata, never in the prompt sent to a real model.
 */

import { canonicalize, createRng } from "@evalforge/shared";
import type {
  Cost,
  EmbedRequest,
  EmbedResponse,
  GenerateRequest,
  ModelProvider,
  ModelResponse,
  ProviderCapabilities,
  ProviderConfig,
  ProviderFactory,
  TokenUsage,
} from "@evalforge/shared";
import { providerRegistry } from "@evalforge/shared";

/** Persona → the accuracy the mock aims for when it can see the gold answer. */
const PERSONA_ACCURACY: Record<string, number> = {
  strong: 0.9,
  balanced: 0.7,
  weak: 0.45,
  random: 0, // handled specially: guesses without using the answer
};

/** Synthetic pricing so cost aggregation is exercised in offline demos. */
const MOCK_RATE = { inputPerMTok: 0.5, outputPerMTok: 1.5 };

const CAPABILITIES: ProviderCapabilities = {
  chat: true,
  tools: true,
  json: true,
  vision: false,
  embeddings: true,
  streaming: false,
  systemPrompt: true,
};

/** The simulation hint a benchmark may attach to `request.metadata.simulation`. */
interface Simulation {
  /** The gold answer (choice letter, number, code, or text). */
  answer?: string;
  /** Choice labels for multiple-choice tasks. */
  choices?: string[];
  /** How to shape the output. Inferred when omitted. */
  style?: "choice" | "number" | "code" | "text";
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const roughTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

class MockProvider implements ModelProvider {
  readonly name = "mock" as const;
  readonly capabilities = CAPABILITIES;

  constructor(private readonly config: ProviderConfig = {}) {}

  async generate(request: GenerateRequest): Promise<ModelResponse> {
    const persona = personaOf(request.model);
    const sim = readSimulation(request);
    const salt = canonicalize({
      model: request.model,
      system: request.system ?? "",
      messages: request.messages,
      seed: request.params?.seed ?? 0,
    });
    const rng = createRng(salt);

    const { text, finishReason } = this.render(persona, sim, rng);

    const promptText =
      (request.system ?? "") +
      request.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
    const usage: TokenUsage = {
      promptTokens: roughTokens(promptText),
      completionTokens: roughTokens(text),
      totalTokens: 0,
    };
    usage.totalTokens = usage.promptTokens + usage.completionTokens;

    // A deterministic, plausible latency in [20, 220) ms.
    const latencyMs = 20 + Math.floor(rng.next() * 200);

    return {
      id: `mock_${salt.length.toString(36)}`,
      provider: this.name,
      model: request.model,
      text,
      finishReason,
      usage,
      cost: this.estimateCost(usage),
      latencyMs,
    };
  }

  /** Deterministic hashing-trick embedding — cosine-meaningful, no network. */
  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const dims = 64;
    const embeddings = inputs.map((text) => embedText(text, dims));
    const promptTokens = inputs.reduce((s, t) => s + roughTokens(t), 0);
    return {
      model: request.model,
      embeddings,
      usage: { promptTokens, completionTokens: 0, totalTokens: promptTokens },
    };
  }

  estimateCost(usage: TokenUsage): Cost {
    const input = (usage.promptTokens * MOCK_RATE.inputPerMTok) / 1_000_000;
    const output = (usage.completionTokens * MOCK_RATE.outputPerMTok) / 1_000_000;
    return { input, output, total: input + output, currency: "USD" };
  }

  private render(
    persona: string,
    sim: Simulation,
    rng: ReturnType<typeof createRng>,
  ): { text: string; finishReason: ModelResponse["finishReason"] } {
    const style = sim.style ?? inferStyle(sim);
    const target = PERSONA_ACCURACY[persona] ?? PERSONA_ACCURACY.balanced!;
    const knowsAnswer = sim.answer !== undefined && persona !== "random";
    const beCorrect = knowsAnswer && rng.next() < target;

    switch (style) {
      case "choice": {
        const choices = sim.choices && sim.choices.length > 0 ? sim.choices : LETTERS.slice(0, 4);
        const labels = choices.map((_, i) => LETTERS[i]!);
        let letter: string;
        if (beCorrect && sim.answer) {
          letter = normalizeChoiceLetter(sim.answer, choices) ?? rng.pick(labels);
        } else {
          // Guess: uniform over labels (this is the random baseline too).
          letter = rng.pick(labels);
        }
        return { text: `Reasoning omitted for brevity. The answer is (${letter}).`, finishReason: "stop" };
      }
      case "number": {
        const gold = sim.answer ?? String(rng.int(0, 99));
        const value = beCorrect ? gold : perturbNumber(gold, rng);
        return { text: `Working through it step by step.\n#### ${value}`, finishReason: "stop" };
      }
      case "code": {
        if (beCorrect && sim.answer) {
          return { text: "```python\n" + sim.answer + "\n```", finishReason: "stop" };
        }
        // A deliberately-wrong stub so code-exec grades it as a failure.
        return {
          text: "```python\ndef solution(*args, **kwargs):\n    return None  # incorrect\n```",
          finishReason: "stop",
        };
      }
      case "text":
      default: {
        if (beCorrect && sim.answer) return { text: sim.answer, finishReason: "stop" };
        if (sim.answer) return { text: `I believe it is not ${sim.answer}.`, finishReason: "stop" };
        return { text: `Deterministic mock response #${rng.int(1000, 9999)}.`, finishReason: "stop" };
      }
    }
  }
}

function personaOf(model: string): string {
  // Accept both the full spec ("mock:strong") and a bare persona ("strong"),
  // since the CLI strips the "mock:" provider prefix off the model id.
  const raw = model.includes(":") ? model.slice(model.lastIndexOf(":") + 1) : model;
  return raw in PERSONA_ACCURACY ? raw : "balanced";
}

function readSimulation(request: GenerateRequest): Simulation {
  const raw = request.metadata?.simulation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const sim: Simulation = {};
  if (typeof obj.answer === "string") sim.answer = obj.answer;
  if (Array.isArray(obj.choices)) sim.choices = obj.choices.filter((c): c is string => typeof c === "string");
  if (obj.style === "choice" || obj.style === "number" || obj.style === "code" || obj.style === "text") {
    sim.style = obj.style;
  }
  return sim;
}

function inferStyle(sim: Simulation): NonNullable<Simulation["style"]> {
  if (sim.choices && sim.choices.length > 0) return "choice";
  if (sim.answer !== undefined && /^-?\d+(\.\d+)?$/.test(sim.answer.trim())) return "number";
  return "text";
}

/** Map a gold answer (a letter like "B" or a full choice string) to its letter. */
function normalizeChoiceLetter(answer: string, choices: string[]): string | undefined {
  const trimmed = answer.trim();
  const asLetter = trimmed.toUpperCase();
  if (asLetter.length === 1 && LETTERS.includes(asLetter)) return asLetter;
  const idx = choices.findIndex((c) => c.trim() === trimmed);
  return idx >= 0 ? LETTERS[idx] : undefined;
}

function perturbNumber(gold: string, rng: ReturnType<typeof createRng>): string {
  const n = Number(gold);
  if (Number.isFinite(n)) return String(n + rng.pick([-2, -1, 1, 2, 10]));
  return `${gold}_wrong`;
}

/** Hashing-trick bag-of-words embedding, L2-normalized. */
function embedText(text: string, dims: number): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const tok of tokens) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[h % dims]! += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export const createMockProvider: ProviderFactory = (config: ProviderConfig = {}) =>
  new MockProvider(config);

providerRegistry.register("mock", createMockProvider, { overwrite: true });
