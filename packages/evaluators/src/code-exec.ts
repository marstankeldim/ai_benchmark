/**
 * Code-execution judge for coding benchmarks. It assembles a runnable program
 * from the model's code plus the task's test harness, runs it in a {@link Sandbox},
 * and passes when the process exits 0. Per-sample pass/fail is all this returns;
 * the engine aggregates pass@k across repeated samples (see `@evalforge/scoring`).
 *
 * Where the tests come from is configurable (`testsFrom`): by default the task's
 * `reference` field holds the harness (HumanEval convention), but they can also
 * be pulled from `metadata.tests`.
 */

import type {
  CodeExecSpec,
  Evaluator,
  GradeInput,
  GradeResult,
  MetricName,
} from "@evalforge/shared";
import type { Sandbox, SandboxLanguage } from "./sandbox.js";
import { defaultSandbox } from "./sandbox.js";

export class CodeExecEvaluator implements Evaluator {
  readonly kind = "code-exec" as const;

  constructor(
    private readonly spec: CodeExecSpec,
    private readonly sandbox: Sandbox = defaultSandbox,
  ) {}

  async grade({ task, output }: GradeInput): Promise<GradeResult> {
    const language: SandboxLanguage = this.spec.language;
    if (!(await this.sandbox.available(language))) {
      return {
        score: 0,
        passed: false,
        label: "skipped",
        rationale: `no ${language} interpreter available`,
        metadata: { skipped: true },
      };
    }

    const tests = this.resolveTests(task);
    const program = assembleProgram(language, output.value, tests);
    const result = await this.sandbox.run(program, {
      language,
      timeoutMs: this.spec.timeoutMs ?? 10_000,
    });

    const passed = result.exitCode === 0 && !result.timedOut;
    const metric: MetricName = "compilationSuccess";
    const compiled = !/SyntaxError|Traceback \(most recent call last\)/.test(result.stderr) || passed;
    return {
      score: passed ? 1 : 0,
      passed,
      label: result.timedOut ? "timeout" : passed ? "pass" : "fail",
      rationale: passed ? "all tests passed" : truncate(result.stderr || result.stdout, 300),
      subScores: { [metric]: compiled ? 1 : 0 },
      metadata: { exitCode: result.exitCode ?? -1, timedOut: result.timedOut, durationMs: result.durationMs },
    };
  }

  private resolveTests(task: GradeInput["task"]): string {
    if (this.spec.testsFrom === "metadata") {
      const t = task.metadata?.tests;
      return typeof t === "string" ? t : "";
    }
    return task.reference ?? "";
  }
}

/**
 * Combine candidate code with tests into one program. HumanEval-style harnesses
 * define `check(candidate)` and call it, so appending them after the candidate's
 * definition is enough. A shared `prelude` from metadata (imports, helpers) is
 * prepended when present.
 */
export function assembleProgram(language: SandboxLanguage, code: string, tests: string): string {
  const body = stripCodeFences(code);
  if (language === "python") {
    return `${body}\n\n${tests}\n`;
  }
  // JS/TS: tests may be assertions using the exported/declared function.
  return `${body}\n\n${tests}\n`;
}

/** Strip a leading ```lang fence and trailing ``` if the model wrapped its code. */
export function stripCodeFences(text: string): string {
  const fence = text.match(/```(?:[a-zA-Z]+)?\s*\n([\s\S]*?)```/);
  return (fence ? fence[1]! : text).trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
