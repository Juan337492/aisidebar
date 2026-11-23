import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const INSTALL_CMD = "npm install -g https://github.com/Juan337492/aisidebar/releases/latest/download/aisidebar-companion.tgz && aisidebar-companion install";
export const SETUP_URL = "https://github.com/Juan337492/aisidebar#setup";

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
