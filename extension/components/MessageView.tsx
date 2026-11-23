import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronRight, Copy, FileText, Quote, TriangleAlert } from "lucide-react";
import type { Message } from "@/lib/chats";
import { EFFORT_LABELS } from "./ui";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      title="Copy"
      className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export function MessageView({ m, streaming, status, modelName }: { m: Message; streaming: boolean; status?: string; modelName?: string }) {
  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {m.attachments?.map((a, i) => (
          <a
            key={i}
            href={a.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-[85%] items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-muted hover:text-fg"
            title={a.kind === "page" ? a.url : a.text}
          >
            {a.kind === "page" ? <FileText size={12} className="shrink-0" /> : <Quote size={12} className="shrink-0" />}
            <span className="truncate">{a.kind === "page" ? a.title || a.url : a.text.slice(0, 100)}</span>
            {a.truncated && <span className="shrink-0 text-warn">(trimmed)</span>}
          </a>
        ))}
        <div className="max-w-[85%] rounded-2xl bg-elevated px-3.5 py-2 whitespace-pre-wrap">{m.text}</div>
      </div>
    );
  }

  return (
    <div className="group">
      {m.thinking && (
        <details className="mb-2 text-xs text-muted">
          <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-fg">
            <ChevronRight size={12} className="transition-transform [details[open]_&]:rotate-90" />
            Thinking
          </summary>
          <div className="mt-1 border-l-2 border-line pl-3 whitespace-pre-wrap">{m.thinking}</div>
        </details>
      )}
      {m.text ? (
        <div className="md">
          <Markdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
            {m.text}
          </Markdown>
        </div>
      ) : streaming ? (
        <div className="flex items-center gap-2 text-muted" role="status">
          <span className="pulse h-2 w-2 rounded-full bg-accent" />
          <span className="text-xs">{status ?? "Thinking…"}</span>
        </div>
      ) : null}
      {m.error && (
        <div className="mt-2 flex gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{m.error}</span>
        </div>
      )}
      {!streaming && m.text && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <CopyButton text={m.text} />
          <span>
            {modelName ?? m.model}
            {m.effort ? ` · ${EFFORT_LABELS[m.effort] ?? m.effort}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
