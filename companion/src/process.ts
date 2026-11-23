import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";
import { WORKSPACE_DIR } from "./config.ts";

/** PATH plus the usual places CLIs get installed, since launchd starts with a bare PATH. */
export function searchPath(): string[] {
  const extra = [
    join(homedir(), ".local", "bin"),
    join(homedir(), ".claude", "local"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  return [...(process.env.PATH ?? "").split(delimiter), ...extra].filter(Boolean);
}

export function which(name: string): string | undefined {
  for (const dir of searchPath()) {
    const p = join(dir, name);
    try {
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

export function childEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: searchPath().join(delimiter) };
}

export function run(
  bin: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { cwd: WORKSPACE_DIR, env: childEnv(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/**
 * Spawn a CLI and yield each stdout line. Kills the process when `signal` aborts.
 * Throws with stderr if the process exits non-zero without having produced output.
 */
export async function* streamLines(
  bin: string,
  args: string[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const child = spawn(bin, args, {
    cwd: WORKSPACE_DIR,
    env: childEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const kill = () => child.kill("SIGTERM");
  signal.addEventListener("abort", kill, { once: true });

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  const exited = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (e) => {
      stderr += String(e);
      resolve(127);
    });
  });

  let produced = false;
  try {
    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      produced = true;
      yield line;
    }
    const code = await exited;
    if (code !== 0 && !signal.aborted && !produced) {
      throw new Error(stderr.trim() || `${bin} exited with code ${code}`);
    }
  } finally {
    signal.removeEventListener("abort", kill);
    if (child.exitCode === null) child.kill("SIGTERM");
  }
}

export function parseJson(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}
