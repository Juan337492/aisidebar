import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const IS_WINDOWS = /win/i.test(
  (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform,
);
/** One-line installer for this OS: Terminal on macOS/Linux, PowerShell on Windows. */
export const INSTALL_CMD = IS_WINDOWS
  ? "irm https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.ps1 | iex"
  : "curl -fsSL https://raw.githubusercontent.com/Juan337492/aisidebar/main/install.sh | bash";
export const INSTALL_APP = IS_WINDOWS ? "PowerShell" : "Terminal";
/** Windows only: double-click setup file, no typing needed. */
export const WINDOWS_SETUP_URL = "https://github.com/Juan337492/aisidebar/releases/latest/download/AI-Sidebar-Setup.cmd";
export const SETUP_URL = "https://github.com/Juan337492/aisidebar#install";
/** What the approval popup's confirm button is called on this OS. */
export const ALLOW_BUTTON = IS_WINDOWS ? "Yes" : "Allow";

/** A terminal command with a copy button. */
export function CopyCommand({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2 font-mono text-[11px] leading-relaxed">
      <code className="min-w-0 flex-1 break-all select-all">{text}</code>
      <button
        type="button"
        aria-label="Copy command"
        title="Copy"
        className="shrink-0 text-muted hover:text-fg"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        }}
      >
        {done ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
