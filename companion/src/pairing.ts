import { execFile } from "node:child_process";

function browserName(origin: string) {
  if (origin.startsWith("moz-extension:")) return "Firefox";
  if (origin.startsWith("chrome-extension:")) return "Chrome";
  return "A browser";
}

function osa(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Asks the person at the computer to approve a new connection with a native macOS dialog.
 * Resolves true only if they click Allow.
 */
export function askToPair(origin: string): Promise<boolean> {
  if (process.platform !== "darwin") return Promise.reject(new Error("unsupported"));
  const msg =
    `${browserName(origin)} wants to connect the AI Sidebar extension to this computer's Claude and Gemini sign-ins.\n\n` +
    `Extension: ${origin}\n\nOnly allow this if you just clicked Connect in AI Sidebar.`;
  const script = `
    tell me to activate
    set answer to display dialog "${osa(msg)}" with title "AI Sidebar" buttons {"Don't Allow", "Allow"} default button "Allow" cancel button "Don't Allow" with icon caution giving up after 90
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
