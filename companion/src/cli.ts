#!/usr/bin/env node
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, CONFIG_PATH, HOME_DIR } from "./config.ts";
import { startServer, VERSION } from "./server.ts";

const LABEL = "dev.aisidebar.companion";
const PID_FILE = join(HOME_DIR, "companion.pid");
// Windows: per-user "Run" entry that starts a hidden launcher at sign-in.
const WIN_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WIN_RUN_VALUE = "AISidebarCompanion";
const WIN_LAUNCHER = join(HOME_DIR, "start-companion.vbs");
const INSTALL_HINT =
  "  Install it with the one-line installer from https://github.com/Juan337492/aisidebar#install, then run install again.";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const cmd = process.argv[2] ?? "start";
const cfg = loadConfig();

function banner() {
  console.log(`AI Sidebar companion v${VERSION}`);
  console.log(`  URL:   http://127.0.0.1:${cfg.port}`);
  console.log(`  Token: ${cfg.token}`);
  console.log(`  In the AI Sidebar extension, click Connect and allow it in the popup.`);
  console.log(`  (Or paste the URL and token under Settings → Manual setup.) Config: ${CONFIG_PATH}`);
}

function xml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

switch (cmd) {
  case "start": {
    const server = startServer(cfg);
    server.on("listening", () => {
      writeFileSync(PID_FILE, String(process.pid));
      banner();
    });
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
    const script = resolve(fileURLToPath(import.meta.url));
    if (/[\\/]_npx[\\/]/.test(script)) {
      console.error("npx runs from a temporary folder that can be deleted, so auto-start would break.\n" + INSTALL_HINT);
      process.exit(1);
    }
    const nodeArgs = script.endsWith(".ts") ? ["--disable-warning=ExperimentalWarning"] : [];
    if (process.platform === "darwin") installMac([process.execPath, ...nodeArgs, script, "start"]);
    else if (process.platform === "win32") installWindows(process.execPath, [...nodeArgs, script, "start"]);
    else {
      console.error("Auto-start is set up for macOS and Windows. On Linux, run `aisidebar-companion start` (for example from your desktop's startup apps).");
      process.exit(1);
    }
    banner();
    break;
  }
  case "uninstall":
    if (process.platform === "darwin") {
      try { execFileSync("launchctl", ["unload", "-w", PLIST], { stdio: "ignore" }); } catch {}
      rmSync(PLIST, { force: true });
    } else if (process.platform === "win32") {
      try { execFileSync("reg", ["delete", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/f"], { stdio: "ignore" }); } catch {}
      rmSync(WIN_LAUNCHER, { force: true });
    }
    stopRunning();
    console.log("Stopped the companion and removed auto-start.");
    break;
  default:
    console.log("Usage: aisidebar-companion [start|token|install|uninstall]");
    process.exit(1);
}

/** Stops a running companion using the PID it wrote at startup. */
function stopRunning() {
  try {
    const pid = Number(readFileSync(PID_FILE, "utf8"));
    if (pid && pid !== process.pid) process.kill(pid);
  } catch {
    // not running
  }
  rmSync(PID_FILE, { force: true });
}

function installMac(args: string[]) {
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
}

/** VBScript string literal: wrap in quotes and double any inner quotes. */
function vbs(s: string) {
  return `"${s.replace(/"/g, '""')}"`;
}

function installWindows(node: string, args: string[]) {
  // A tiny VBScript launcher runs node with no console window (window style 0) and doesn't wait for it.
  const cmdLine = [node, ...args].map((a) => `Chr(34) & ${vbs(a)} & Chr(34)`).join(' & " " & ');
  writeFileSync(
    WIN_LAUNCHER,
    `' Starts the AI Sidebar companion without a console window.\r\n` +
      `Set sh = CreateObject("WScript.Shell")\r\n` +
      `sh.Run ${cmdLine}, 0, False\r\n`,
  );
  execFileSync("reg", ["add", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/t", "REG_SZ", "/d", `wscript.exe "${WIN_LAUNCHER}"`, "/f"], {
    stdio: "ignore",
  });
  stopRunning();
  spawn("wscript.exe", [WIN_LAUNCHER], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  console.log("Installed and started. It will start automatically when you sign in to Windows.");
}
