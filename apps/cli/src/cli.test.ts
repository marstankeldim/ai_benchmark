import { describe, expect, it } from "vitest";
import { bool, list, num, parseArgs, str } from "./args.js";
import { parseModelSpec } from "./models.js";
import { progressBar, table } from "./console.js";

describe("arg parser", () => {
  it("parses positionals, key=value, key value, flags, and --no-x", () => {
    const a = parseArgs(["run", "--benchmark", "gsm8k", "--limit=5", "--all", "--no-cache"]);
    expect(a._).toEqual(["run"]);
    expect(str(a, "benchmark")).toBe("gsm8k");
    expect(num(a, "limit")).toBe(5);
    expect(bool(a, "all")).toBe(true);
    expect(bool(a, "cache")).toBe(false);
  });

  it("collects repeated and comma-separated list flags", () => {
    const a = parseArgs(["--model", "mock:strong", "--model", "mock:weak", "--benchmark", "gsm8k,mmlu"]);
    expect(list(a, "model")).toEqual(["mock:strong", "mock:weak"]);
    expect(list(a, "benchmark")).toEqual(["gsm8k", "mmlu"]);
  });
});

describe("model spec parser", () => {
  it("splits on the first colon", () => {
    expect(parseModelSpec("openai:gpt-4o")).toMatchObject({ provider: "openai", model: "gpt-4o", label: "openai:gpt-4o" });
    expect(parseModelSpec("mock:balanced")).toMatchObject({ provider: "mock", model: "balanced" });
  });

  it("folds sampling params in", () => {
    const m = parseModelSpec("openai:gpt-4o", { temperature: 0.7 });
    expect(m.params).toEqual({ temperature: 0.7 });
  });

  it("rejects malformed specs", () => {
    expect(() => parseModelSpec("gpt-4o")).toThrow(/provider:model/);
    expect(() => parseModelSpec("openai:")).toThrow();
  });
});

describe("console helpers", () => {
  it("renders an aligned table", () => {
    const t = table([{ header: "A" }, { header: "B", align: "right" }], [["x", "1"], ["yy", "22"]]);
    expect(t).toContain("A");
    expect(t.split("\n").length).toBe(4); // header + rule + 2 rows
  });

  it("progress bar reflects completion", () => {
    expect(progressBar(5, 10, 10)).toContain("5/10");
    expect(progressBar(10, 10, 10)).toContain("██████████");
  });
});
