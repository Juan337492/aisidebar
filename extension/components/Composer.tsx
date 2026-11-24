import { useEffect, useRef, useState, type ReactNode } from "react";
import { browser, type Browser } from "wxt/browser";
import { ArrowUp, Camera, FileText, Image as ImageIcon, Plus, Quote, Square, X } from "lucide-react";
import type { Attachment } from "@/lib/chats";
import {
  captureScreenshot,
  hasPageAccess,
  pageAttachment,
  readableTabs,
  readActivePage,
  readTab,
  requestPageAccess,
  shrinkImage,
} from "@/lib/page";

export interface Injection {
  id: string;
  text?: string;
  attachments: Attachment[];
}

const MAX_IMAGES = 4;

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

function Chip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  return (
    <span className="flex max-w-full items-center gap-1.5 rounded-lg bg-elevated px-2 py-1 text-xs">
      {a.kind === "image" && a.dataUrl ? (
        <img src={a.dataUrl} alt="" className="h-6 w-8 shrink-0 rounded object-cover" />
      ) : a.kind === "page" ? (
        <FileText size={12} className="shrink-0 text-muted" />
      ) : (
        <Quote size={12} className="shrink-0 text-muted" />
      )}
      <span className="truncate">{a.kind === "selection" ? a.text.slice(0, 80) : a.title || a.url}</span>
      <button type="button" aria-label="Remove" className="text-muted hover:text-fg" onClick={onRemove}>
        <X size={12} />
      </button>
    </span>
  );
}

/** "+" menu: attach another open tab. */
function TabMenu({ onPick, onClose }: { onPick: (t: Browser.tabs.Tab) => void; onClose: () => void }) {
  const [tabs, setTabs] = useState<Browser.tabs.Tab[]>();
  useEffect(() => {
    readableTabs().then(setTabs);
    const close = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-full left-2 z-20 mb-2 max-h-72 w-[min(320px,calc(100vw-40px))] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
        <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted">Attach a tab</p>
        {tabs?.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">No other readable tabs.</p>}
        {tabs?.map((t) => (
          <button
            key={t.id}
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-elevated"
            onClick={() => onPick(t)}
          >
            {t.favIconUrl ? <img src={t.favIconUrl} alt="" className="h-3.5 w-3.5 shrink-0" /> : <FileText size={13} className="shrink-0 text-muted" />}
            <span className="truncate">{t.title || t.url}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  picker,
  inject,
  imagesSupported = true,
  placeholder = "How can I help you today?",
}: {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  picker: ReactNode;
  inject?: Injection;
  /** Whether the selected model can look at images. */
  imagesSupported?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [usePage, setUsePage] = useState(false);
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState<string>();
  const [tabMenu, setTabMenu] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const tabTitle = useActiveTabTitle();
  const imageCount = attachments.filter((a) => a.kind === "image").length;

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

  /** Runs `fn` after the page-access prompt, which must start synchronously inside the click. */
  const withAccess = (label: string, fn: () => Promise<void>) => {
    setError(undefined);
    requestPageAccess().then(async (ok) => {
      if (!ok) return setError("Page access was declined.");
      setWorking(label);
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setWorking(undefined);
      }
    });
  };

  const togglePage = () => {
    setError(undefined);
    if (usePage) return setUsePage(false);
    withAccess("", async () => setUsePage(true));
  };

  const screenshot = () => {
    if (imageCount >= MAX_IMAGES) return setError(`Up to ${MAX_IMAGES} images per message.`);
    withAccess("Taking screenshot…", async () => {
      const shot = await captureScreenshot();
      setAttachments((a) => [...a, shot]);
    });
  };

  const attachTab = (t: Browser.tabs.Tab) => {
    setTabMenu(false);
    withAccess("Reading tab…", async () => {
      const page = await readTab(t.id!);
      setAttachments((a) => [...a.filter((x) => !(x.kind === "page" && x.url === page.url)), pageAttachment(page)]);
    });
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    if (!imagesSupported) return setError("This model can't look at images.");
    for (const f of files.slice(0, MAX_IMAGES - imageCount)) {
      const dataUrl = await shrinkImage(f);
      setAttachments((a) => [...a, { kind: "image", title: f.name || "Pasted image", text: "", dataUrl }]);
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (!t || busy || disabled || working) return;
    if (!imagesSupported && imageCount) return setError("This model can't look at images. Remove them or pick another model.");
    const atts = [...attachments];
    if (usePage) {
      try {
        if (!(await hasPageAccess())) throw new Error("Page access is off. Click the page chip to allow it.");
        const page = await readActivePage();
        const pageAtts: Attachment[] = [pageAttachment(page)];
        // Highlighted text on the page says what you're asking about.
        if (page.selection && !atts.some((a) => a.kind === "selection" && a.text === page.selection)) {
          pageAtts.push({ kind: "selection", text: page.selection, url: page.url, title: page.title });
        }
        atts.unshift(...pageAtts.filter((p) => !atts.some((a) => a.kind === "page" && a.url === p.url && p.kind === "page")));
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setText("");
    setAttachments([]);
    setError(undefined);
    onSend(t, atts);
  };

  const tool = "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg disabled:opacity-40";

  return (
    <div className="relative rounded-2xl border border-line bg-surface shadow-sm focus-within:border-muted">
      {tabMenu && <TabMenu onPick={attachTab} onClose={() => setTabMenu(false)} />}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {attachments.map((a, i) => (
            <Chip key={i} a={a} onRemove={() => setAttachments((x) => x.filter((_, j) => j !== i))} />
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
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="block w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14px] leading-relaxed outline-none placeholder:text-muted"
      />
      {(error || working) && <p className={`px-4 pb-1 text-xs ${error ? "text-danger" : "text-muted"}`}>{error ?? working}</p>}
      <div className="flex items-center gap-0.5 px-2 pb-2">
        <button type="button" className={tool} aria-label="Attach a tab" title="Attach another tab" onClick={() => setTabMenu((v) => !v)}>
          <Plus size={15} />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Screenshot"
          title={imagesSupported ? "Attach a screenshot of this tab" : "This model can't look at images"}
          disabled={!imagesSupported || !!working}
          onClick={screenshot}
        >
          {imageCount ? <ImageIcon size={14} /> : <Camera size={14} />}
        </button>
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
              disabled={!text.trim() || disabled || !!working}
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
