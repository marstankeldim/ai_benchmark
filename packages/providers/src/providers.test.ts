import { afterEach, describe, expect, it, vi } from "vitest";
import type { GenerateRequest } from "@evalforge/shared";
// Import through the package index so every provider self-registers (side effect).
import {
  availableProviders,
  computeCost,
  createMockProvider,
  createProvider,
  estimateCostFor,
  lookupPricing,
  mapFinish,
  normalizeUsage,
  parseToolCalls,
  toOpenAIMessages,
} from "./index.js";

const req = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  model: "mock:balanced",
  messages: [{ role: "user", content: "hi" }],
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("registry & factory", () => {
  it("registers all seven providers", () => {
    const names = availableProviders();
    for (const n of ["openai", "anthropic", "google", "openrouter", "groq", "ollama", "mock"]) {
      expect(names).toContain(n);
    }
  });

  it("throws a helpful error for an unknown provider", () => {
    expect(() => createProvider("does-not-exist")).toThrow(/Unknown provider/);
  });

  it("resolves api keys from the environment", () => {
    const p = createProvider("openai", {}, { OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
    expect(p.name).toBe("openai");
  });
});

describe("pricing", () => {
  it("computes cost with cached-token discount", () => {
    const pricing = lookupPricing("openai", "gpt-4o")!;
    const cost = computeCost(
      { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000, cachedTokens: 500_000 },
      pricing,
    );
    // 500k uncached @2.5 + 500k cached @1.25 + 1M output @10 = 1.25 + 0.625 + 10
    expect(cost.total).toBeCloseTo(11.875, 6);
  });

  it("returns undefined for unpriced models", () => {
    expect(estimateCostFor("openai", "no-such-model", { promptTokens: 1, completionTokens: 1, totalTokens: 2 }))
      .toBeUndefined();
  });
});

describe("openai wire conversions", () => {
  it("prepends the system prompt as a message", () => {
    const msgs = toOpenAIMessages(req({ system: "be terse", messages: [{ role: "user", content: "q" }] }));
    expect(msgs[0]).toEqual({ role: "system", content: "be terse" });
    expect(msgs[1]).toMatchObject({ role: "user", content: "q" });
  });

  it("parses tool call arguments, keeping the raw string", () => {
    const calls = parseToolCalls([
      { id: "c1", function: { name: "f", arguments: '{"x":1}' } },
      { function: { name: "g", arguments: "not json" } },
    ]);
    expect(calls[0]).toMatchObject({ id: "c1", name: "f", arguments: { x: 1 }, argumentsRaw: '{"x":1}' });
    expect(calls[1]!.arguments).toBe("not json");
  });

  it("normalizes usage and finish reasons", () => {
    const u = normalizeUsage({ prompt_tokens: 3, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 1 } });
    expect(u).toMatchObject({ promptTokens: 3, completionTokens: 4, totalTokens: 7, cachedTokens: 1 });
    expect(mapFinish("length")).toBe("length");
    expect(mapFinish("tool_calls")).toBe("tool_calls");
  });
});

describe("mock provider", () => {
  it("is deterministic for identical requests", async () => {
    const mock = createMockProvider();
    const r1 = await mock.generate(req());
    const r2 = await mock.generate(req());
    expect(r1.text).toBe(r2.text);
    expect(r1.latencyMs).toBe(r2.latencyMs);
  });

  it("answers multiple-choice using the simulation hint, and strong beats weak", async () => {
    const mock = createMockProvider();
    const choices = ["Paris", "London", "Rome", "Berlin"];
    let strongCorrect = 0;
    let weakCorrect = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      const base = {
        messages: [{ role: "user" as const, content: `Q${i}: capital of France?` }],
        metadata: { simulation: { answer: "A", choices, style: "choice" } },
      };
      const strong = await mock.generate(req({ ...base, model: "mock:strong" }));
      const weak = await mock.generate(req({ ...base, model: "mock:weak" }));
      if (/\(A\)/.test(strong.text)) strongCorrect++;
      if (/\(A\)/.test(weak.text)) weakCorrect++;
    }
    expect(strongCorrect).toBeGreaterThan(weakCorrect);
    expect(strongCorrect / N).toBeGreaterThan(0.7);
  });

  it("emits GSM8K-style numeric answers", async () => {
    const mock = createMockProvider();
    const r = await mock.generate(
      req({ model: "mock:strong", metadata: { simulation: { answer: "42", style: "number" } } }),
    );
    expect(r.text).toMatch(/####/);
  });

  it("produces cosine-meaningful embeddings", async () => {
    const mock = createMockProvider();
    const { embeddings } = await mock.embed({ model: "mock", input: ["the cat sat", "the cat sat"] });
    const cos = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);
    expect(cos(embeddings[0]!, embeddings[1]!)).toBeCloseTo(1, 6); // identical → 1
  });

  it("charges a synthetic but nonzero cost", async () => {
    const mock = createMockProvider();
    const r = await mock.generate(req({ messages: [{ role: "user", content: "x".repeat(400) }] }));
    expect(r.cost!.total).toBeGreaterThan(0);
  });
});
