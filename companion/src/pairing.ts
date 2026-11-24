import { execFile } from "node:child_process";
import { which } from "./process.ts";

function browserName(origin: string) {
  if (origin.startsWith("moz-extension:")) return "Firefox";
  if (origin.startsWith("chrome-extension:")) return "Chrome";
  return "A browser";
}

function osa(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Asks the person at the computer to approve a new connection with a native dialog
 * (macOS, Windows, or zenity/kdialog on Linux). Resolves true only if they click Allow.
 * "Don't Allow" is the default everywhere, so pressing Enter while typing elsewhere can't approve it.
 */
export function askToPair(origin: string): Promise<boolean> {
  if (process.platform === "win32") return askWindows(origin);
  if (process.platform !== "darwin") return askLinux(origin);
  const msg =
    `${browserName(origin)} wants to connect the AI Sidebar extension to this computer's AI sign-ins.\n\n` +
    `Extension: ${origin}\n\nOnly allow this if you just clicked Connect in AI Sidebar.`;
  const script = `
    tell me to activate
    set answer to display dialog "${osa(msg)}" with title "AI Sidebar" buttons {"Don't Allow", "Allow"} default button "Don't Allow" cancel button "Don't Allow" with icon caution giving up after 90
    if gave up of answer then return "timeout"
    return button returned of answer`;
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout: 100_000 }, (err, stdout, stderr) => {
      const answer = String(stdout).trim();
      // "Don't Allow" is the cancel button, which osascript reports as error -128 (user canceled).
      if (err && !String(stderr).includes("-128")) console.error("Pairing dialog failed:", String(stderr).trim() || err.message);
      console.log(`Pairing request from ${origin}: ${answer === "Allow" ? "allowed" : answer === "timeout" ? "timed out" : "denied"}`);
      resolve(!err && answer === "Allow");
    });
  });
}

/** Windows: a topmost Yes/No message box via PowerShell. The text travels in an env var, never in the command. */
function askWindows(origin: string): Promise<boolean> {
  const msg =
    `${browserName(origin)} wants to connect the AI Sidebar extension to this computer's AI sign-ins.\n\n` +
    `Extension: ${origin}\n\nOnly click Yes if you just clicked Connect in AI Sidebar.`;
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }",
    "$r = [System.Windows.Forms.MessageBox]::Show($owner, $env:AISIDEBAR_PAIR_MSG, 'AI Sidebar', 'YesNo', 'Warning', 'Button2')",
    "Write-Output $r",
  ].join("; ");
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { timeout: 100_000, windowsHide: false, env: { ...process.env, AISIDEBAR_PAIR_MSG: msg } },
      (err, stdout, stderr) => {
        const answer = String(stdout).trim();
        if (err) console.error("Pairing dialog failed:", String(stderr).trim() || err.message);
        console.log(`Pairing request from ${origin}: ${answer === "Yes" ? "allowed" : "denied"}`);
        resolve(!err && answer === "Yes");
      },
    );
  });
}

/** Linux desktops: zenity (GNOME and most others) or kdialog (KDE). Rejects if neither is available. */
function askLinux(origin: string): Promise<boolean> {
  const msg =
    `${browserName(origin)} wants to connect the AI Sidebar extension to this computer's AI sign-ins.\n\n` +
    `Extension: ${origin}\n\nOnly allow this if you just clicked Connect in AI Sidebar.`;
  const zenity = which("zenity");
  const kdialog = zenity ? undefined : which("kdialog");
  if (!zenity && !kdialog) return Promise.reject(new Error("unsupported"));
  const [bin, args] = zenity
    ? [zenity, ["--question", "--title", "AI Sidebar", "--text", msg, "--ok-label", "Allow", "--cancel-label", "Don't Allow", "--default-cancel", "--no-markup", "--timeout", "90"]]
    : [kdialog!, ["--title", "AI Sidebar", "--yes-label", "Allow", "--no-label", "Don't Allow", "--warningyesno", msg]];
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 100_000 }, (err) => {
      const code = err ? (typeof err.code === "number" ? err.code : -1) : 0;
      // zenity/kdialog exit 1 for "Don't Allow" and 5 for timeout; anything else means no display to show it on.
      if (code !== 0 && code !== 1 && code !== 5) return reject(new Error("unsupported"));
      console.log(`Pairing request from ${origin}: ${code === 0 ? "allowed" : "denied"}`);
      resolve(code === 0);
    });
  });
}
