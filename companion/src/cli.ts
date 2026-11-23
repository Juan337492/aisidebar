#!/usr/bin/env node
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, CONFIG_PATH, HOME_DIR } from "./config.ts";
import { startServer, VERSION } from "./server.ts";

const LABEL = "dev.aisidebar.companion";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const cmd = process.argv[2] ?? "start";
const cfg = loadConfig();

function banner() {
  console.log(`AI Sidebar companion v${VERSION}`);
  console.log(`  URL:   http://127.0.0.1:${cfg.port}`);
  console.log(`  Token: ${cfg.token}`);
  console.log(`  Paste both into the extension's Settings → Companion. Config: ${CONFIG_PATH}`);
}

function xml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

switch (cmd) {
  case "start": {
    const server = startServer(cfg);
    server.on("listening", banner);
    server.on("error", (e: NodeJS.ErrnoException) => {
      console.error(e.code === "EADDRINUSE" ? `Port ${cfg.port} is in use — is the companion already running?` : e);
      process.exit(1);
    });
    break;
  }
  case "token":
    banner();
    break;
  case "install": {
    if (process.platform !== "darwin") {
      console.error("Auto-start install is macOS-only for now. Run `npm run companion` instead.");
      process.exit(1);
    }
    const script = resolve(fileURLToPath(import.meta.url));
    const args = [process.execPath, "--disable-warning=ExperimentalWarning", script, "start"];
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(
      PLIST,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array>${args.map((a) => `<string>${xml(a)}</string>`).join("")}</array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH ?? "")}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(join(HOME_DIR, "companion.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(HOME_DIR, "companion.log"))}</string>
</dict></plist>
`,
    );
    try { execFileSync("launchctl", ["unload", PLIST], { stdio: "ignore" }); } catch {}
    execFileSync("launchctl", ["load", "-w", PLIST]);
    console.log(`Installed and started (${PLIST}). It will start automatically at login.`);
    banner();
    break;
  }
  case "uninstall":
    try { execFileSync("launchctl", ["unload", "-w", PLIST], { stdio: "ignore" }); } catch {}
    rmSync(PLIST, { force: true });
    console.log("Removed the auto-start service.");
    break;
  default:
    console.log("Usage: aisidebar-companion [start|token|install|uninstall]");
    process.exit(1);
}
