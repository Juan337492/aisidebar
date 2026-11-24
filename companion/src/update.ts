import { existsSync, openSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOME_DIR, VERSION } from "./config.ts";
import type { UpdateInfo } from "./types.ts";
import { parseCmdShim, which } from "./process.ts";

export const REPO = "Juan337492/aisidebar";
export const RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
export const TGZ_URL = process.env.AISIDEBAR_TGZ ?? `https://github.com/${REPO}/releases/latest/download/aisidebar-companion.tgz`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** "0.10.1" > "0.9.3". Pre-release tags and junk compare as older. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(/[.-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** Where npm put this package, if it was installed with npm (not run from a source checkout). */
export function npmInstall(script = fileURLToPath(import.meta.url)) {
  const pkgDir = resolve(dirname(script), "..");
  const nodeModules = dirname(pkgDir);
  if (basename(pkgDir) !== "aisidebar-companion" || basename(nodeModules) !== "node_modules") return undefined;
  // Windows: <prefix>\node_modules\pkg. Elsewhere: <prefix>/lib/node_modules/pkg.
  const prefix = process.platform === "win32" ? dirname(nodeModules) : dirname(dirname(nodeModules));
  return { pkgDir, prefix, cli: join(pkgDir, "dist", "cli.js") };
}

/** npm's own script, so updating can run it with this Node: no shell needed. */
export function npmCli(): string | undefined {
  const dir = dirname(process.execPath);
  const beside = [join(dir, "node_modules", "npm", "bin", "npm-cli.js"), join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")].find(
    (p) => existsSync(p),
  );
  if (beside) return beside;
  // Homebrew and similar keep npm apart from Node: follow the npm on PATH to its script.
  const bin = which("npm");
  if (!bin) return undefined;
  try {
    if (/\.cmd$/i.test(bin)) {
      const script = parseCmdShim(readFileSync(bin, "utf8"));
      return script ? join(dirname(bin), script) : undefined;
    }
    const real = realpathSync(bin);
    return real.endsWith(".js") ? real : undefined;
  } catch {
    return undefined;
  }
}

let cache: { at: number; latest?: string } | undefined;

export async function checkForUpdate(force = false): Promise<Pick<UpdateInfo, "current" | "latest" | "updateAvailable" | "canSelfUpdate" | "releaseUrl">> {
  if (force || !cache || Date.now() - cache.at > 6 * 60 * 60_000) {
    try {
      const res = await fetch(API_URL, {
        headers: { accept: "application/vnd.github+json", "user-agent": "aisidebar-companion" },
        signal: AbortSignal.timeout(8000),
      });
      const body = res.ok ? ((await res.json()) as { tag_name?: string }) : {};
      cache = { at: Date.now(), latest: body.tag_name?.replace(/^v/, "") };
    } catch {
      // Offline: try again in a few minutes rather than in six hours.
      cache = { at: Date.now() - 6 * 60 * 60_000 + 5 * 60_000, latest: cache?.latest };
    }
  }
  const latest = cache.latest;
  return {
    current: VERSION,
    latest,
    updateAvailable: !!latest && isNewer(latest, VERSION),
    canSelfUpdate: !!npmInstall() && !!npmCli(),
    releaseUrl: RELEASE_URL,
  };
}

/**
 * Runs `aisidebar-companion update` as a separate, detached process: it installs the new version and
 * restarts the background service, which ends this process. Its output goes to companion.log.
 */
export function startSelfUpdate(): Promise<void> {
  const install = npmInstall();
  if (!install || !npmCli()) return Promise.reject(new Error("This companion wasn't installed with the installer, so it can't update itself."));
  const log = openSync(join(HOME_DIR, "companion.log"), "a");
  const child = spawn(process.execPath, [install.cli, "update"], {
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  child.unref();
  return new Promise((resolveExit, reject) => {
    // Only fails fast (bad Node, etc.). A successful update restarts us before it exits.
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolveExit() : reject(new Error(`The update failed (exit ${code}). See ${join(HOME_DIR, "companion.log")}.`))));
  });
}
