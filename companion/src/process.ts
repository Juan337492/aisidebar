import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { basename, delimiter, dirname, join } from "node:path";
import { homedir } from "node:os";
import { WORKSPACE_DIR } from "./config.ts";

export const IS_WINDOWS = process.platform === "win32";

/** PATH plus the usual places CLIs get installed, since auto-start runs with a bare PATH. */
export function searchPath(): string[] {
  const home = homedir();
  const extra = IS_WINDOWS
    ? [
        join(home, ".local", "bin"), // Claude Code native installer
        process.env.APPDATA && join(process.env.APPDATA, "npm"), // npm global installs
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "agy", "bin"), // Antigravity CLI installer
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"),
      ]
    : [join(home, ".local", "bin"), join(home, ".claude", "local"), "/opt/homebrew/bin", "/usr/local/bin"];
  return [...(process.env.PATH ?? "").split(delimiter), ...extra].filter((d): d is string => !!d);
}

/** Windows looks for name.exe / name.cmd etc.; prefer real .exe files over batch shims. */
function candidates(name: string): string[] {
  if (!IS_WINDOWS) return [name];
  const exts = (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").toLowerCase().split(";").filter(Boolean);
  const ordered = [".exe", ...exts.filter((e) => e !== ".exe")];
  return ordered.map((e) => name + e);
}

export function isExecutable(p: string): boolean {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, IS_WINDOWS ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function which(name: string): string | undefined {
  for (const dir of searchPath()) {
    for (const file of candidates(name)) {
      const p = join(dir, file);
      if (isExecutable(p)) return p;
    }
  }
  return undefined;
}

/**
 * How to launch `bin` without a shell. Windows can't start .cmd/.bat files without cmd.exe, and running chat
 * text through cmd.exe would be unsafe, so npm's .cmd shims are resolved to `node <script>` instead.
 */
export function spawnTarget(bin: string): { cmd: string; args: string[] } {
  // A plain Node script (handy for custom wrappers and tests) runs with this Node on every OS.
  if (/\.(c|m)?js$/i.test(bin)) return { cmd: process.execPath, args: [bin] };
  if (!IS_WINDOWS || !/\.(cmd|bat)$/i.test(bin)) return { cmd: bin, args: [] };
  const script = parseCmdShim(readFileSync(bin, "utf8"));
  if (script) return { cmd: process.execPath, args: [join(dirname(bin), script)] };
  throw new Error(
    `${basename(bin)} is a batch file that AI Sidebar can't run safely. Install the regular (.exe) version of this tool.`,
  );
}

/** Extracts the script path from an npm-generated .cmd shim, e.g. `"%dp0%\node_modules\pkg\cli.js" %*`. */
export function parseCmdShim(text: string): string | undefined {
  const m = text.match(/"%~?dp0%?\\?([^"%]+?\.(?:c|m)?js)"/i);
  return m?.[1];
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
    let target: { cmd: string; args: string[] };
    try {
      target = spawnTarget(bin);
    } catch (e) {
      return resolve({ code: 1, stdout: "", stderr: (e as Error).message });
    }
    const child = execFile(
      target.cmd,
      [...target.args, ...args],
      { cwd: WORKSPACE_DIR, env: childEnv(), timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      },
    );
    // Nothing to send: close stdin so CLIs that read it when it isn't a terminal don't wait forever.
    child.stdin?.end();
  });
}

/**
 * Spawn a CLI and yield each stdout line. Kills the process when `signal` aborts.
 * Throws with stderr if the process exits non-zero, even after some output: CLIs print a session line
 * first, so a crash or auth error later in the turn must not look like an empty answer.
 * (Callers that stop reading once they have a final result never reach this check.)
 */
export async function* streamLines(
  bin: string,
  args: string[],
  signal: AbortSignal,
  /** Written to the CLI's stdin, then closed. Keeps long prompts off the command line (Windows caps it at ~32K). */
  input?: string,
): AsyncGenerator<string> {
  const target = spawnTarget(bin);
  const child = spawn(target.cmd, [...target.args, ...args], {
    cwd: WORKSPACE_DIR,
    env: childEnv(),
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  if (input !== undefined && child.stdin) {
    child.stdin.on("error", () => {}); // the CLI may exit before reading everything
    child.stdin.end(input);
  }
  const kill = () => child.kill("SIGTERM");
  signal.addEventListener("abort", kill, { once: true });

  let stderr = "";
  child.stderr!.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  const exited = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (e) => {
      stderr += String(e);
      resolve(127);
    });
  });

  try {
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      yield line;
    }
    const code = await exited;
    if (code !== 0 && !signal.aborted) {
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

const URL_RE = /https:\/\/[^\s"'<>)\]]+/;

/**
 * Runs a CLI sign-in command and watches its output for the sign-in URL.
 * The CLI opens the official page itself; it never shows us the user's password.
 */
export function watchLogin(bin: string, args: string[], timeoutMs = 10 * 60_000) {
  const target = spawnTarget(bin);
  const child = spawn(target.cmd, [...target.args, ...args], {
    cwd: WORKSPACE_DIR,
    env: childEnv(),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let urlCb: ((u: string) => void) | undefined;
  let seenUrl: string | undefined;
  let tail = "";
  const onData = (d: Buffer) => {
    const text = d.toString();
    tail = (tail + text).slice(-2000);
    const m = text.match(URL_RE);
    if (m && !seenUrl) {
      seenUrl = m[0];
      urlCb?.(seenUrl);
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", (e) => reject(new Error(String(e))));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(signal ? "Sign-in was cancelled or timed out." : stripAnsi(tail).split("\n").map((l) => l.trim()).filter((l) => l && !/https?:\/\//.test(l)).slice(-2).join(" ") || `Sign-in failed (exit ${code}).`));
    });
  });
  return {
    child,
    done,
    onUrl(cb: (u: string) => void) {
      urlCb = cb;
      if (seenUrl) cb(seenUrl);
    },
    cancel() {
      child.kill("SIGTERM");
    },
  };
}

export function stripAnsi(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}
