import { describe, expect, it } from "vitest";
import type {
  GenerateRequest,
  GradeInput,
  ModelProvider,
  ModelResponse,
  ParsedOutput,
} from "@evalforge/shared";
import { buildEvaluator, resolveEvaluator } from "./factory.js";
import { validateJsonSchema } from "./json-schema.js";
import { parseChoiceLetter, parseNumber } from "./normalize.js";
import { defaultSandbox } from "./sandbox.js";

const out = (value: string, raw = value): ParsedOutput => ({ raw, value });
const gi = (task: Partial<GradeInput["task"]>, value: string): GradeInput => ({
  task: { id: "t", input: "q", ...task },
  response: { id: "r", provider: "mock", model: "m", text: value, finishReason: "stop", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, latencyMs: 1 },
  output: out(value),
});

describe("normalize helpers", () => {
  it("parses trailing numbers, currency, and fractions", () => {
    expect(parseNumber("The answer is $1,234.50")).toBe(1234.5);
    expect(parseNumber("#### 42")).toBe(42);
    expect(parseNumber("3/4 of a pie")).toBe(0.75);
    expect(parseNumber("no number here")).toBeUndefined();
  });
  it("extracts a choice letter", () => {
    expect(parseChoiceLetter("The answer is (C).")).toBe("C");
    expect(parseChoiceLetter("b")).toBe("B");
  });
});

describe("deterministic evaluators", () => {
  it("exact-match with normalization", async () => {
    const e = buildEvaluator({ kind: "exact-match", normalize: true });
    expect((await e.grade(gi({ expected: "Paris" }, "  paris! "))).passed).toBe(true);
    expect((await e.grade(gi({ expected: "Paris" }, "London"))).passed).toBe(false);
  });

  it("numeric within tolerance", async () => {
    const e = buildEvaluator({ kind: "numeric", tolerance: 0.01 });
    expect((await e.grade(gi({ expected: "42" }, "#### 42.0"))).passed).toBe(true);
    expect((await e.grade(gi({ expected: "42" }, "43"))).passed).toBe(false);
  });

  it("choice maps gold text to a letter", async () => {
    const e = buildEvaluator({ kind: "choice" });
    const task = { expected: "Rome", choices: ["Paris", "London", "Rome", "Berlin"] };
    expect((await e.grade(gi(task, "The answer is (C)"))).passed).toBe(true);
    expect((await e.grade(gi(task, "(A)"))).passed).toBe(false);
  });

  it("includes with all/any modes", async () => {
    const all = buildEvaluator({ kind: "includes", mode: "all" });
    const g = gi({ reference: "cat, hat" }, "the cat wore a hat");
    expect((await all.grade(g)).passed).toBe(true);
    const any = buildEvaluator({ kind: "includes", mode: "any" });
    expect((await any.grade(gi({ reference: "dog, cat" }, "only a cat"))).passed).toBe(true);
  });

  it("regex", async () => {
    const e = buildEvaluator({ kind: "regex", pattern: "^\\d{3}-\\d{4}$" });
    expect((await e.grade(gi({}, "123-4567"))).passed).toBe(true);
  });

  it("json-schema validity", async () => {
    const e = buildEvaluator({
      kind: "json-schema",
      schema: { type: "object", required: ["name", "age"], properties: { name: { type: "string" }, age: { type: "integer" } } },
    });
    expect((await e.grade(gi({}, '{"name":"Ada","age":36}'))).passed).toBe(true);
    expect((await e.grade(gi({}, '{"name":"Ada"}'))).passed).toBe(false);
    expect((await e.grade(gi({}, "not json"))).passed).toBe(false);
  });
});

describe("json-schema validator", () => {
  it("checks nested arrays, enums, and bounds", () => {
    const schema = {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        rating: { type: "number", minimum: 0, maximum: 5 },
        status: { enum: ["ok", "fail"] },
      },
      required: ["rating"],
    };
    expect(validateJsonSchema({ rating: 4, tags: ["a"], status: "ok" }, schema).valid).toBe(true);
    expect(validateJsonSchema({ rating: 9, status: "nope" }, schema).valid).toBe(false);
  });
});

// ── Model-backed judges use inline fake providers (hermetic) ──────────────────

function fakeProvider(reply: (req: GenerateRequest) => string, embedText?: (s: string) => number[]): ModelProvider {
  return {
    name: "mock",
    capabilities: { chat: true, tools: false, json: true, vision: false, embeddings: !!embedText, streaming: false, systemPrompt: true },
    async generate(req): Promise<ModelResponse> {
      return { id: "x", provider: "mock", model: req.model, text: reply(req), finishReason: "stop", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, cost: { input: 0, output: 0.001, total: 0.001, currency: "USD" }, latencyMs: 1 };
    },
    ...(embedText
      ? {
          async embed(req) {
            const inputs = Array.isArray(req.input) ? req.input : [req.input];
            return { model: req.model, embeddings: inputs.map(embedText), usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } };
          },
        }
      : {}),
    estimateCost: () => ({ input: 0, output: 0, total: 0, currency: "USD" }),
  };
}

describe("llm-judge", () => {
  it("parses a JSON verdict and normalizes the score", async () => {
    const provider = fakeProvider(() => '{"score": 8, "correct": true, "reasoning": "solid"}');
    const e = buildEvaluator(
      { kind: "llm-judge", judgeModel: { provider: "mock", model: "judge" }, scale: { min: 0, max: 10 } },
      { resolveProvider: () => provider },
    );
    const res = await e.grade(gi({ expected: "42" }, "42"));
    expect(res.score).toBeCloseTo(0.8, 6);
    expect(res.passed).toBe(true);
    expect(res.judgeCost?.total).toBeGreaterThan(0);
  });

  it("requires a provider resolver", () => {
    expect(() => buildEvaluator({ kind: "llm-judge", judgeModel: { provider: "mock", model: "j" } })).toThrow(/resolver/);
  });
});

describe("semantic similarity", () => {
  it("scores identical text as 1 and different as less", async () => {
    const embed = (s: string): number[] => {
      const v = [0, 0, 0, 0];
      for (const t of s.toLowerCase().split(/\W+/).filter(Boolean)) v[t.length % 4]! += 1;
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    };
    const provider = fakeProvider(() => "", embed);
    const e = buildEvaluator(
      { kind: "semantic-similarity", embeddingModel: { provider: "mock", model: "emb" }, threshold: 0.99 },
      { resolveProvider: () => provider },
    );
    const same = await e.grade(gi({ expected: "hello world" }, "hello world"));
    expect(same.score).toBeCloseTo(1, 6);
    expect(same.passed).toBe(true);
  });
});

describe("composite", () => {
  it("weights sub-scores", async () => {
    const e = buildEvaluator({
      kind: "composite",
      components: [
        { spec: { kind: "exact-match" }, weight: 1 },
        { spec: { kind: "numeric" }, weight: 3 },
      ],
    });
    // exact fails ("42.0" ≠ "42"), numeric passes → 0*1/4 + 1*3/4 = 0.75
    const res = await e.grade(gi({ expected: "42" }, "42.0"));
    expect(res.score).toBeCloseTo(0.75, 6);
  });
});

describe("resolveEvaluator", () => {
  it("passes a live evaluator through untouched", () => {
    const live = buildEvaluator({ kind: "exact-match" });
    expect(resolveEvaluator(live)).toBe(live);
  });
});

describe("code-exec (skips if no python)", () => {
  it("runs python tests when available", async () => {
    const available = await defaultSandbox.available("python");
    const e = buildEvaluator({ kind: "code-exec", language: "python", timeoutMs: 8000 });
    const task = { id: "c", input: "add", reference: "assert add(2, 3) == 5\nprint('ok')" };
    const res = await e.grade({
      task,
      response: gi(task, "").response,
      output: out("def add(a, b):\n    return a + b"),
    });
    if (available) {
      expect(res.passed).toBe(true);
    } else {
      expect(res.label).toBe("skipped");
    }
  });
});
