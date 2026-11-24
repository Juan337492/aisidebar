import { useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, ChevronRight, Copy, FileText, Pencil, Quote, RotateCcw, TriangleAlert } from "lucide-react";
import type { Message } from "@/lib/chats";
import { formatTokens } from "@/lib/prompt";
import { EFFORT_LABELS } from "./ui";

function useCopy() {
  const [done, setDone] = useState(false);
  return [
    done,
    (text: string) => {
      navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    },
  ] as const;
}

function CopyButton({ text }: { text: string }) {
  const [done, copy] = useCopy();
  return (
    <button type="button" aria-label="Copy" title="Copy" className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg" onClick={() => copy(text)}>
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** Plain text of rendered children (for copying a code block). */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

/** Code block with its language and a copy button. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [done, copy] = useCopy();
  const code = Array.isArray(children) ? children[0] : children;
  const cls = (code && typeof code === "object" && "props" in code ? (code as { props: { className?: string } }).props.className : "") ?? "";
  const lang = cls.match(/language-([\w+-]+)/)?.[1];
  return (
    <div className="code-block">
      <div className="flex items-center justify-between px-3 pt-1.5 text-[11px] text-muted">
        <span>{lang ?? "code"}</span>
        <button type="button" className="flex items-center gap-1 rounded px-1 hover:text-fg" onClick={() => copy(textOf(children).replace(/\n$/, ""))}>
          {done ? <Check size={12} /> : <Copy size={12} />}
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const markdownComponents = {
  a: (p: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...p} target="_blank" rel="noreferrer" />,
  pre: ({ children }: { children?: ReactNode }) => <CodeBlock>{children}</CodeBlock>,
};

function usageText(m: Message) {
  const i = formatTokens(m.usage?.inputTokens);
  const o = formatTokens(m.usage?.outputTokens);
  if (!i && !o) return undefined;
  return [i && `${i} in`, o && `${o} out`].filter(Boolean).join(" · ") + " tokens";
}

export function MessageView({
  m,
  streaming,
  status,
  modelName,
  isLast,
  onRetry,
  onEdit,
}: {
  m: Message;
  streaming: boolean;
  status?: string;
  modelName?: string;
  /** Last message in the chat (only the last answer can be retried). */
  isLast?: boolean;
  onRetry?: () => void;
  onEdit?: () => void;
}) {
  if (m.role === "user") {
    return (
      <div className="group flex flex-col items-end gap-1.5">
        {m.attachments?.map((a, i) =>
          a.kind === "image" && a.dataUrl ? (
            <img key={i} src={a.dataUrl} alt={a.title ?? "Image"} title={a.title} className="max-h-40 max-w-[85%] rounded-lg border border-line" />
          ) : (
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
              {a.repeat && <span className="shrink-0">(unchanged)</span>}
            </a>
          ),
        )}
        <div className="max-w-[85%] rounded-2xl bg-elevated px-3.5 py-2 whitespace-pre-wrap">{m.text}</div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
          >
            <Pencil size={11} /> Edit
          </button>
        )}
      </div>
    );
  }

  const usage = usageText(m);
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
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false }]]} components={markdownComponents}>
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
      {!streaming && (m.text || m.error) && (
        <div
          className={`mt-1 flex items-center gap-1 text-[11px] text-muted transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
            isLast && m.error ? "" : "opacity-0"
          }`}
        >
          {m.text && <CopyButton text={m.text} />}
          {isLast && onRetry && (
            <button type="button" aria-label="Retry" title="Ask again" className="rounded-md p-1 text-muted hover:bg-elevated hover:text-fg" onClick={onRetry}>
              <RotateCcw size={14} />
            </button>
          )}
          <span className="truncate">
            {modelName ?? m.model}
            {m.effort ? ` · ${EFFORT_LABELS[m.effort] ?? m.effort}` : ""}
            {usage ? ` · ${usage}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
