/**
 * LLM-as-a-judge. A configurable model (GPT / Claude / Gemini / any provider)
 * scores a response against a rubric and gold reference, returning a structured
 * verdict. We ask for JSON, parse defensively, and normalize the numeric score
 * onto [0, 1]. The judge's own token cost is surfaced separately in `judgeCost`
 * so it never contaminates the model-under-test's economics.
 */

import { extractJson, safeJsonParse } from "@evalforge/shared";
import type {
  Evaluator,
  GradeInput,
  GradeResult,
  LlmJudgeSpec,
  ModelConfig,
  ModelProvider,
} from "@evalforge/shared";

type ProviderResolver = (model: ModelConfig) => ModelProvider;

const DEFAULT_RUBRIC = `You are grading a model's answer to a task.
Judge whether the answer is correct and high quality given the reference.
Consider correctness first, then completeness and clarity.`;

interface Verdict {
  score?: number;
  correct?: boolean;
  reasoning?: string;
}

export class LlmJudgeEvaluator implements Evaluator {
  readonly kind = "llm-judge" as const;
  private readonly scale: { min: number; max: number };

  constructor(
    private readonly spec: LlmJudgeSpec,
    private readonly resolveProvider: ProviderResolver,
  ) {
    this.scale = spec.scale ?? { min: 0, max: 10 };
  }

  async grade(input: GradeInput): Promise<GradeResult> {
    const provider = this.resolveProvider(this.spec.judgeModel);
    const prompt = this.buildPrompt(input);

    const response = await provider.generate({
      model: this.spec.judgeModel.model,
      system:
        "You are a meticulous, impartial evaluator. Respond ONLY with compact JSON: " +
        `{"score": <number ${this.scale.min}-${this.scale.max}>, "correct": <true|false>, "reasoning": "<short>"}.`,
      messages: [{ role: "user", content: prompt }],
      params: { temperature: 0, ...(this.spec.judgeModel.params ?? {}) },
      responseFormat: { type: "json_object" },
    });

    const verdict =
      (extractJson<Verdict>(response.text) as Verdict | undefined) ??
      (safeJsonParse<Verdict>(response.text) as Verdict | undefined) ??
      {};

    const raw = typeof verdict.score === "number" ? verdict.score : verdict.correct ? this.scale.max : this.scale.min;
    const span = this.scale.max - this.scale.min || 1;
    const score = clamp01((raw - this.scale.min) / span);
    const threshold = this.spec.passThreshold ?? 0.5;
    const passed = verdict.correct ?? score >= threshold;

    return {
      score,
      passed,
      label: passed ? "correct" : "incorrect",
      ...(verdict.reasoning ? { rationale: verdict.reasoning } : {}),
      ...(response.cost ? { judgeCost: response.cost } : {}),
      metadata: { judgeModel: this.spec.judgeModel.model, rawScore: raw },
    };
  }

  private buildPrompt(input: GradeInput): string {
    const { task, output } = input;
    const promptText = typeof task.input === "string" ? task.input : JSON.stringify(task.input);
    const template = this.spec.rubric ?? DEFAULT_RUBRIC;
    // Support {prompt} {expected} {output} placeholders; otherwise append sections.
    if (/\{(prompt|expected|output)\}/.test(template)) {
      return template
        .replace(/\{prompt\}/g, promptText)
        .replace(/\{expected\}/g, task.expected ?? task.reference ?? "(none)")
        .replace(/\{output\}/g, output.value);
    }
    return [
      template,
      `\n[TASK]\n${promptText}`,
      task.expected || task.reference ? `\n[REFERENCE ANSWER]\n${task.expected ?? task.reference}` : "",
      `\n[MODEL ANSWER]\n${output.value}`,
      `\nReturn your JSON verdict now.`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
