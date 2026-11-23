import { useEffect, useRef, useState, type ReactNode } from "react";
import { browser } from "wxt/browser";
import { ArrowUp, FileText, Quote, Square, X } from "lucide-react";
import type { Attachment } from "@/lib/chats";
import { hasPageAccess, readActivePage, requestPageAccess } from "@/lib/page";

export interface Injection {
  id: string;
  text?: string;
  attachments: Attachment[];
}

function useActiveTabTitle() {
  const [title, setTitle] = useState<string>();
  useEffect(() => {
    const load = () =>
      browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTitle(t?.title || t?.url));
    load();
    const onActivated = () => load();
    const onUpdated = (_id: number, info: { title?: string; status?: string }) => {
      if (info.title || info.status === "complete") load();
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
  return title;
}

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  picker,
  inject,
  placeholder = "How can I help you today?",
}: {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  picker: ReactNode;
  inject?: Injection;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [usePage, setUsePage] = useState(false);
  const [pageError, setPageError] = useState<string>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const tabTitle = useActiveTabTitle();

  useEffect(() => {
    if (!inject) return;
    setAttachments((a) => [...a, ...inject.attachments]);
    if (inject.text) setText(inject.text);
    ref.current?.focus();
  }, [inject?.id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [text]);

  const togglePage = () => {
    setPageError(undefined);
    if (usePage) return setUsePage(false);
    // Permission prompt must start synchronously inside the click.
    requestPageAccess().then((ok) => {
      if (ok) setUsePage(true);
      else setPageError("Page access was declined.");
    });
  };

  const submit = async () => {
    const t = text.trim();
    if (!t || busy || disabled) return;
    const atts = [...attachments];
    if (usePage) {
      try {
        if (!(await hasPageAccess())) throw new Error("Page access is off. Click the page chip to allow it.");
        const page = await readActivePage();
        atts.unshift({ kind: "page", title: page.title, url: page.url, text: page.text, truncated: page.truncated });
      } catch (e) {
        setPageError((e as Error).message);
        return;
      }
    }
    setText("");
    setAttachments([]);
    setPageError(undefined);
    onSend(t, atts);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-sm focus-within:border-muted">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {attachments.map((a, i) => (
            <span key={i} className="flex max-w-full items-center gap-1.5 rounded-lg bg-elevated px-2 py-1 text-xs">
              <Quote size={12} className="shrink-0 text-muted" />
              <span className="truncate">{a.text.slice(0, 80)}</span>
              <button
                type="button"
                aria-label="Remove"
                className="text-muted hover:text-fg"
                onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-relaxed outline-none placeholder:text-muted"
      />
      {pageError && <p className="px-4 pb-1 text-xs text-danger">{pageError}</p>}
      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          type="button"
          onClick={togglePage}
          aria-pressed={usePage}
          title={usePage ? "This page will be sent with your message" : "Send the current page with your message"}
          className={`flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs ${
            usePage ? "bg-accent/15 text-accent" : "text-muted hover:bg-elevated hover:text-fg"
          }`}
        >
          <FileText size={13} className="shrink-0" />
          <span className="truncate">{usePage ? tabTitle || "This page" : "Use page"}</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {picker}
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fg text-bg"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              aria-label="Send"
              disabled={!text.trim() || disabled}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg disabled:opacity-40"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
