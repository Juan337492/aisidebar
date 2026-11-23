import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOME_DIR = process.env.AISIDEBAR_HOME ?? join(homedir(), ".aisidebar");
export const CONFIG_PATH = join(HOME_DIR, "config.json");
/** Empty working directory the CLIs run in, so they never touch your projects. */
export const WORKSPACE_DIR = join(HOME_DIR, "workspace");

export interface Config {
  port: number;
  token: string;
  /** Optional absolute paths overriding CLI auto-detection. */
  binaries: Record<string, string | undefined>;
}

export function loadConfig(): Config {
  mkdirSync(HOME_DIR, { recursive: true, mode: 0o700 });
  mkdirSync(WORKSPACE_DIR, { recursive: true });
  let cfg: Partial<Config> = {};
  try {
    cfg = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    // first run
  }
  const full: Config = {
    port: Number(process.env.AISIDEBAR_PORT ?? cfg.port ?? 8765),
    token: cfg.token ?? randomBytes(24).toString("base64url"),
    binaries: cfg.binaries ?? {},
  };
  if (!cfg.token || cfg.port === undefined || !cfg.binaries) saveConfig(full);
  return full;
}

export function saveConfig(cfg: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}
