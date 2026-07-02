/**
 * Shared machinery for multiple-choice benchmarks (MMLU, ARC, TruthfulQA…). They
 * differ only in their questions, so prompt construction, output parsing, and the
 * simulation hint for the mock provider are factored here.
 */

import type { BenchmarkCategory, BenchmarkTask, GenerateRequest, ParsedOutput } from "@evalforge/shared";
import { CHOICE_LETTERS, extractChoiceLetter } from "./parse.js";

const MCQ_SYSTEM =
  "You are taking a multiple-choice exam. Read the question and options, reason briefly, " +
  "then end your answer with the single letter of the correct option, e.g. \"Answer: C\".";

/** Render choices as "A. ...\nB. ..." lines. */
export function formatChoices(choices: string[]): string {
  return choices.map((c, i) => `${CHOICE_LETTERS[i]}. ${c}`).join("\n");
}

/** Build the model request for a multiple-choice task, with a mock simulation hint. */
export function mcqBuildRequest(task: BenchmarkTask, category: BenchmarkCategory): GenerateRequest {
  const choices = task.choices ?? [];
  const prompt = `${asText(task.input)}\n\n${formatChoices(choices)}\n\nAnswer:`;
  return {
    model: "",
    system: MCQ_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    params: { temperature: 0, maxTokens: 512 },
    metadata: {
      category,
      simulation: { answer: task.expected ?? "", choices, style: "choice" },
    },
  };
}

/** Extract the chosen letter from a multiple-choice response. */
export function mcqParseOutput(text: string): ParsedOutput {
  const letter = extractChoiceLetter(text);
  return { raw: text, value: letter ?? text.trim() };
}

function asText(input: BenchmarkTask["input"]): string {
  return typeof input === "string" ? input : JSON.stringify(input);
}
