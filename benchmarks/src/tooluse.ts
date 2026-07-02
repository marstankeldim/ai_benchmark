/**
 * Tool-use benchmark — function calling + JSON correctness. The model gets a
 * six-function catalog and a natural-language request; it must pick the right
 * function and emit exactly the right arguments.
 *
 * Output handling accepts both paths a provider can take: a *native* tool call
 * (`response.toolCalls`) or a JSON object in the text. Either way `parseOutput`
 * canonicalizes to `{"arguments":…,"name":…}` with sorted keys, so grading is a
 * strict string comparison. The composite judge adds partial credit (25%) for
 * output that is at least schema-valid `{name, arguments}` — separating "wrong
 * call" from "can't produce JSON at all".
 */

import { canonicalize, extractJson } from "@evalforge/shared";
import type { BenchmarkTask, GenerateRequest, ModelResponse, ParsedOutput } from "@evalforge/shared";
import { defineBenchmark } from "./lib/define.js";
import { TOOLUSE_TASKS, TOOL_CATALOG } from "./data/tooluse.js";

const SYSTEM =
  "You are a function-calling assistant. Choose exactly one of the available functions and " +
  "call it with the correct arguments. If you cannot call functions natively, respond with " +
  'ONLY a JSON object of the form {"name": "<function>", "arguments": { ... }} and nothing else. ' +
  "Copy argument values exactly from the request (dates as YYYY-MM-DD, amounts as numbers).";

function buildRequest(task: BenchmarkTask): GenerateRequest {
  const catalog = TOOL_CATALOG.map((t) => `- ${t.name}: ${t.description ?? ""}`).join("\n");
  return {
    model: "",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Available functions:\n${catalog}\n\nRequest: ${typeof task.input === "string" ? task.input : ""}`,
      },
    ],
    tools: TOOL_CATALOG,
    toolChoice: "auto",
    params: { temperature: 0, maxTokens: 256 },
    metadata: {
      category: "tool-use",
      simulation: { answer: task.expected ?? "", style: "json" },
    },
  };
}

function parseOutput(response: ModelResponse, _task: BenchmarkTask): ParsedOutput {
  // Preferred path: a native tool call from the provider.
  const call = response.toolCalls?.[0];
  if (call) {
    const normalized = { arguments: call.arguments ?? {}, name: call.name };
    return { raw: response.text, value: canonicalize(normalized), parsed: normalized };
  }
  // Fallback: a JSON object embedded in the text.
  const parsed = extractJson(response.text);
  if (parsed !== undefined && typeof parsed === "object" && parsed !== null) {
    return { raw: response.text, value: canonicalize(parsed), parsed };
  }
  return { raw: response.text, value: response.text.trim() };
}

export const tooluse = defineBenchmark({
  id: "tool-use",
  name: "Tool Use",
  version: "1.0.0",
  category: "tool-use",
  description: "Function selection and argument correctness, graded on canonical JSON.",
  promptVersion: "tooluse-v1",
  metrics: ["toolCallAccuracy", "jsonValidity", "meanLatencyMs"],
  evaluator: {
    kind: "composite",
    components: [
      // Exactly the right call — the headline signal.
      { spec: { kind: "exact-match", caseSensitive: true, trim: true }, weight: 3 },
      // At least a schema-valid {name, arguments} object — partial credit.
      {
        spec: {
          kind: "json-schema",
          schema: {
            type: "object",
            required: ["name", "arguments"],
            properties: { name: { type: "string" }, arguments: { type: "object" } },
          },
        },
        weight: 1,
      },
    ],
  },
  defaultParams: { temperature: 0, maxTokens: 256 },
  tags: ["tool-use", "function-calling", "structured-output"],
  tasks: TOOLUSE_TASKS,
  buildRequest,
  parseOutput,
});
