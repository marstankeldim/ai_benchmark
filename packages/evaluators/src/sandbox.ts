/**
 * Code execution sandbox. Coding benchmarks (HumanEval, MBPP) grade by *running*
 * a candidate program against hidden tests, so we need to execute untrusted code
 * with a hard timeout.
 *
 * Two backends behind one `Sandbox` interface:
 *  - **local** — a subprocess with a kill-on-timeout. Fast, dev-only; it does NOT
 *    isolate the filesystem or network, so never point it at adversarial code.
 *  - **docker** — an ephemeral, network-less container per submission (the
 *    recommended production backend). Selected via `EVALFORGE_SANDBOX=docker`.
 *
 * Adding a backend is a new implementation of `Sandbox`; the evaluator is agnostic.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type SandboxLanguage = "python" | "javascript" | "typescript";

export interface RunOptions {
  language: SandboxLanguage;
  timeoutMs?: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface Sandbox {
  run(code: string, options: RunOptions): Promise<SandboxResult>;
  /** Whether the interpreter for a language is available on this machine. */
  available(language: SandboxLanguage): Promise<boolean>;
}

const FILENAME: Record<SandboxLanguage, string> = {
  python: "main.py",
  javascript: "main.mjs",
  typescript: "main.ts",
};

function interpreter(language: SandboxLanguage): { cmd: string; args: (file: string) => string[] } {
  switch (language) {
    case "python":
      return { cmd: process.env.PYTHON ?? "python3", args: (f) => [f] };
    case "typescript":
      return { cmd: "npx", args: (f) => ["--yes", "tsx", f] };
    case "javascript":
    default:
      return { cmd: process.execPath, args: (f) => [f] };
  }
}

/** Spawn a process, capturing output and enforcing a wall-clock timeout. */
function exec(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), exitCode: null, timedOut, durationMs: Date.now() - start });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut, durationMs: Date.now() - start });
    });
  });
}

export class LocalSandbox implements Sandbox {
  private readonly availability = new Map<SandboxLanguage, boolean>();

  constructor(private readonly defaultTimeoutMs = 10_000) {}

  async run(code: string, options: RunOptions): Promise<SandboxResult> {
    const dir = await mkdtemp(join(tmpdir(), "evalforge-"));
    const file = join(dir, FILENAME[options.language]);
    try {
      await writeFile(file, code, "utf8");
      const { cmd, args } = interpreter(options.language);
      return await exec(cmd, args(file), dir, options.timeoutMs ?? this.defaultTimeoutMs);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async available(language: SandboxLanguage): Promise<boolean> {
    const cached = this.availability.get(language);
    if (cached !== undefined) return cached;
    const probe: Record<SandboxLanguage, [string, string[]]> = {
      python: [process.env.PYTHON ?? "python3", ["--version"]],
      javascript: [process.execPath, ["--version"]],
      typescript: [process.execPath, ["--version"]],
    };
    const [cmd, args] = probe[language];
    const res = await exec(cmd, args, tmpdir(), 5000).catch(() => null);
    const ok = res != null && res.exitCode === 0;
    this.availability.set(language, ok);
    return ok;
  }
}

/** The default sandbox singleton (local backend). */
export const defaultSandbox = new LocalSandbox();
