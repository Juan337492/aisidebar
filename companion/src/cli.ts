#!/usr/bin/env node
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig, CONFIG_PATH, HOME_DIR } from "./config.ts";
import { startServer, VERSION } from "./server.ts";
import { checkForUpdate, npmCli, npmInstall, TGZ_URL } from "./update.ts";
import { which } from "./process.ts";
import { systemdArg, windowsLauncherScript, xml } from "./escape.ts";

const LABEL = "dev.aisidebar.companion";
const PID_FILE = join(HOME_DIR, "companion.pid");
const LOG_FILE = join(HOME_DIR, "companion.log");
const MAX_LOG_BYTES = 1024 * 1024;
/** `start` exits with this when another companion already has the port, so supervisors stop retrying. */
const EXIT_PORT_IN_USE = 3;
// Windows: per-user "Run" entry that starts a hidden launcher at sign-in.
const WIN_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WIN_RUN_VALUE = "AISidebarCompanion";
const WIN_LAUNCHER = join(HOME_DIR, "start-companion.ps1");
const WIN_OLD_LAUNCHER = join(HOME_DIR, "start-companion.vbs"); // v0.2.0
// Linux: a systemd user service, or an XDG autostart entry on systems without systemd.
const SYSTEMD_UNIT = join(homedir(), ".config", "systemd", "user", "aisidebar-companion.service");
const XDG_AUTOSTART = join(homedir(), ".config", "autostart", "aisidebar-companion.desktop");
const INSTALL_HINT =
  "  Install it with the one-line installer from https://github.com/Juan337492/aisidebar#install, then run install again.";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const SCRIPT = resolve(fileURLToPath(import.meta.url));
/** Node flags needed to run this file directly (only when running from source). */
const NODE_ARGS = SCRIPT.endsWith(".ts") ? ["--disable-warning=ExperimentalWarning"] : [];
const cmd = process.argv[2] ?? "start";
const flags = new Set(process.argv.slice(3));
const cfg = loadConfig();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function banner() {
  console.log(`AI Sidebar companion v${VERSION}`);
  console.log(`  URL:   http://127.0.0.1:${cfg.port}`);
  console.log(`  Token: ${cfg.token}`);
  console.log(`  In the AI Sidebar extension, click Connect and allow it in the popup.`);
  console.log(`  (Or paste the URL and token under Settings → Manual setup.) Config: ${CONFIG_PATH}`);
}

/** Keeps companion.log small: past 1 MB, the old contents move to companion.log.1. */
function rotateLog() {
  try {
    if (statSync(LOG_FILE).size < MAX_LOG_BYTES) return;
    copyFileSync(LOG_FILE, LOG_FILE + ".1");
    // Truncate in place (not rename): launchd keeps the file open and appends to it.
    truncateSync(LOG_FILE, 0);
  } catch {
    // no log yet
  }
}

/** Sends console output to companion.log, for background runs that have no terminal. */
function logToFile() {
  const write = (level: string, args: unknown[]) => {
    const line = args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    try {
      appendFileSync(LOG_FILE, `${new Date().toISOString()} ${level} ${line}\n`);
    } catch {
      // disk full or similar; nothing useful to do
    }
  };
  console.log = (...a: unknown[]) => write("info", a);
  console.error = (...a: unknown[]) => write("error", a);
  process.on("uncaughtException", (e) => {
    write("fatal", [e]);
    process.exit(1);
  });
}

async function main() {
  switch (cmd) {
    case "start": {
      rotateLog();
      if (flags.has("--log")) logToFile();
      const server = startServer(cfg);
      server.on("listening", () => {
        writeFileSync(PID_FILE, String(process.pid));
        banner();
      });
      server.on("error", (e: NodeJS.ErrnoException) => {
        console.error(e.code === "EADDRINUSE" ? `Port ${cfg.port} is in use — is the companion already running?` : e);
        process.exit(e.code === "EADDRINUSE" ? EXIT_PORT_IN_USE : 1);
      });
      break;
    }
    case "service":
      supervise();
      break;
    case "token":
      banner();
      break;
    case "install":
      install();
      await startService();
      banner();
      break;
    case "uninstall":
      removeService();
      await stopRunning();
      console.log("Stopped the companion and removed auto-start.");
      break;
    case "update":
      await update();
      break;
    case "version":
      console.log(VERSION);
      break;
    default:
      console.log("Usage: aisidebar-companion [start|token|install|uninstall|update|version]");
      process.exit(1);
  }
}

/**
 * Keeps `start` running in the background (Windows, and Linux without systemd): restarts it after a crash,
 * backing off if it keeps failing. Stops when the companion exits cleanly or another copy has the port.
 */
function supervise() {
  let failures = 0;
  const launch = () => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [...NODE_ARGS, SCRIPT, "start", "--log"], { stdio: "ignore", windowsHide: true });
    child.on("exit", (code) => {
      if (code === 0 || code === EXIT_PORT_IN_USE) process.exit(0);
      failures = Date.now() - startedAt > 60_000 ? 1 : failures + 1;
      if (failures > 8) {
        appendFileSync(LOG_FILE, `${new Date().toISOString()} fatal The companion keeps crashing; giving up until next sign-in.\n`);
        process.exit(1);
      }
      setTimeout(launch, Math.min(60_000, 1000 * 2 ** failures));
    });
  };
  launch();
}

function isServiceInstalled(): boolean {
  if (process.platform === "darwin") return existsSync(PLIST);
  if (process.platform === "win32") return spawnSync("reg", ["query", WIN_RUN_KEY, "/v", WIN_RUN_VALUE], { stdio: "ignore" }).status === 0;
  return existsSync(SYSTEMD_UNIT) || existsSync(XDG_AUTOSTART);
}

function install() {
  if (/[\\/]_npx[\\/]/.test(SCRIPT)) {
    console.error("npx runs from a temporary folder that can be deleted, so auto-start would break.\n" + INSTALL_HINT);
    process.exit(1);
  }
  if (process.platform === "darwin") installMac();
  else if (process.platform === "win32") installWindows();
  else installLinux();
}

/** (Re)starts the background copy so it runs the code that's installed now. */
async function startService() {
  if (process.platform === "darwin") {
    try { execFileSync("launchctl", ["unload", PLIST], { stdio: "ignore" }); } catch {}
    await stopRunning(); // a copy started by hand, or by an older version
    execFileSync("launchctl", ["load", "-w", PLIST]);
  } else if (process.platform === "win32") {
    await stopRunning();
    spawn("powershell.exe", winLauncherArgs(), { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else if (existsSync(SYSTEMD_UNIT)) {
    await stopRunning();
    execFileSync("systemctl", ["--user", "restart", "aisidebar-companion.service"], { stdio: "ignore" });
  } else {
    await stopRunning();
    spawn(process.execPath, [...NODE_ARGS, SCRIPT, "service"], { detached: true, stdio: "ignore" }).unref();
  }
  // Wait until it answers, so the installer can say "running" truthfully.
  for (let i = 0; i < 40; i++) {
    if (await healthy()) return void console.log("Running now, and it will start automatically when you sign in.");
    await sleep(250);
  }
  console.error(`Installed auto-start, but the companion didn't answer yet. Check ${LOG_FILE}.`);
}

function removeService() {
  if (process.platform === "darwin") {
    try { execFileSync("launchctl", ["unload", "-w", PLIST], { stdio: "ignore" }); } catch {}
    rmSync(PLIST, { force: true });
  } else if (process.platform === "win32") {
    try { execFileSync("reg", ["delete", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/f"], { stdio: "ignore" }); } catch {}
    rmSync(WIN_LAUNCHER, { force: true });
    rmSync(WIN_OLD_LAUNCHER, { force: true });
  } else {
    if (existsSync(SYSTEMD_UNIT)) {
      try { execFileSync("systemctl", ["--user", "disable", "--now", "aisidebar-companion.service"], { stdio: "ignore" }); } catch {}
      rmSync(SYSTEMD_UNIT, { force: true });
      try { execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" }); } catch {}
    }
    rmSync(XDG_AUTOSTART, { force: true });
  }
}

async function healthy(): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${cfg.port}/health`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Stops the running companion by asking it to shut down (so we never kill an unrelated process). */
async function stopRunning() {
  if (!(await healthy())) return void rmSync(PID_FILE, { force: true });
  let status = 0;
  try {
    const r = await fetch(`http://127.0.0.1:${cfg.port}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(3000),
    });
    status = r.status;
  } catch {
    // it may close the connection while exiting
  }
  if (status === 404) killLegacy(); // v0.2.0 had no /shutdown
  for (let i = 0; i < 40 && (await healthy()); i++) await sleep(150);
  rmSync(PID_FILE, { force: true });
}

/** Older companions: kill by PID file, but only if that PID is still a Node process. */
function killLegacy() {
  try {
    const pid = Number(readFileSync(PID_FILE, "utf8"));
    if (!pid || pid === process.pid) return;
    const name =
      process.platform === "win32"
        ? String(spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" }).stdout)
        : String(spawnSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" }).stdout);
    if (/node/i.test(name)) process.kill(pid);
  } catch {
    // not running
  }
}

/** Installs the latest release over this one with npm, then restarts the background service. */
async function update() {
  const target = npmInstall(SCRIPT);
  const npm = npmCli();
  if (!target || !npm) {
    console.error("This copy wasn't installed with the installer, so it can't update itself.\n" + INSTALL_HINT);
    process.exit(1);
  }
  const info = await checkForUpdate(true);
  if (!info.updateAvailable && !flags.has("--force")) {
    console.log(`Already up to date (v${VERSION}).`);
    return;
  }
  console.log(`${new Date().toISOString()} Updating the companion from v${VERSION} to v${info.latest ?? "latest"}…`);
  execFileSync(process.execPath, [npm, "install", "-g", "--prefix", target.prefix, "--no-fund", "--no-audit", TGZ_URL], {
    stdio: "inherit",
  });
  if (isServiceInstalled()) {
    // Run the newly installed version's install, so the service definition matches the new code too.
    execFileSync(process.execPath, [target.cli, "install"], { stdio: "inherit" });
  } else {
    console.log("Updated. Restart the companion to use the new version.");
  }
}

function installMac() {
  const args = [process.execPath, ...NODE_ARGS, SCRIPT, "start"];
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
  <!-- Restart after a crash, but stay stopped after a clean shutdown (uninstall, update). -->
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <!-- Lets a self-update started by the companion outlive it. -->
  <key>AbandonProcessGroup</key><true/>
  <key>StandardOutPath</key><string>${xml(LOG_FILE)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG_FILE)}</string>
</dict></plist>
`,
  );
  console.log(`Installed auto-start (${PLIST}).`);
}

function winLauncherArgs() {
  return ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", WIN_LAUNCHER];
}

function installWindows() {
  // A small PowerShell launcher starts the supervisor hidden (VBScript is being phased out of Windows).
  writeFileSync(WIN_LAUNCHER, windowsLauncherScript(process.execPath, [...NODE_ARGS, SCRIPT, "service"]));
  rmSync(WIN_OLD_LAUNCHER, { force: true });
  const value = ["powershell.exe", ...winLauncherArgs().map((a) => (a === WIN_LAUNCHER ? `"${a}"` : a))].join(" ");
  execFileSync("reg", ["add", WIN_RUN_KEY, "/v", WIN_RUN_VALUE, "/t", "REG_SZ", "/d", value, "/f"], { stdio: "ignore" });
  console.log("Installed auto-start (runs when you sign in to Windows).");
}

function installLinux() {
  if (which("systemctl") && spawnSync("systemctl", ["--user", "show-environment"], { stdio: "ignore" }).status === 0) {
    mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
    const exec = [process.execPath, ...NODE_ARGS, SCRIPT, "start"].map(systemdArg).join(" ");
    writeFileSync(
      SYSTEMD_UNIT,
      `[Unit]
Description=AI Sidebar companion
After=default.target

[Service]
ExecStart=${exec}
Environment=${systemdArg(`PATH=${process.env.PATH ?? ""}`)}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`,
    );
    rmSync(XDG_AUTOSTART, { force: true });
    execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" });
    execFileSync("systemctl", ["--user", "enable", "aisidebar-companion.service"], { stdio: "ignore" });
    console.log(`Installed auto-start (systemd user service: ${SYSTEMD_UNIT}).`);
    return;
  }
  // No systemd user session: use the desktop's startup apps instead.
  mkdirSync(join(homedir(), ".config", "autostart"), { recursive: true });
  const q = (s: string) => `"${s.replace(/(["`$\\])/g, "\\$1")}"`;
  writeFileSync(
    XDG_AUTOSTART,
    `[Desktop Entry]
Type=Application
Name=AI Sidebar companion
Exec=${[process.execPath, ...NODE_ARGS, SCRIPT, "service"].map(q).join(" ")}
NoDisplay=true
X-GNOME-Autostart-enabled=true
`,
  );
  console.log(`Installed auto-start (${XDG_AUTOSTART}).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
