import { useEffect, useMemo, useState } from "react";
import { Check, Download, Pencil, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { deleteChat, downloadMarkdown, loadChat, renameChat, searchChats, setPinned, useChatList, type ChatMeta } from "@/lib/chats";
import { ConfirmButton, timeAgo } from "./ui";

const rowBtn = "rounded p-1.5 text-muted hover:bg-line hover:text-fg";

function Row({ c, active, onOpen }: { c: ChatMeta; active: boolean; onOpen: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(c.title);
  useEffect(() => setTitle(c.title), [c.title]);
  const save = async () => {
    setEditing(false);
    if (title.trim() && title.trim() !== c.title) await renameChat(c.id, title);
    else setTitle(c.title);
  };

  if (editing) {
    return (
      <li className="flex items-center gap-1 rounded-lg bg-elevated px-2 py-1">
        <input
          autoFocus
          aria-label="Chat name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setTitle(c.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-1 py-1 outline-none"
        />
        <button type="button" aria-label="Save name" className={rowBtn} onMouseDown={(e) => e.preventDefault()} onClick={save}>
          <Check size={13} />
        </button>
      </li>
    );
  }

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-elevated ${active ? "bg-elevated" : ""}`}
      >
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
        <span className="shrink-0 text-[11px] text-muted group-focus-within:invisible group-hover:invisible">{timeAgo(c.updatedAt)}</span>
      </button>
      <div className="absolute top-1/2 right-1 hidden -translate-y-1/2 gap-0.5 rounded-md bg-elevated group-focus-within:flex group-hover:flex">
        <button type="button" aria-label="Rename" title="Rename" className={rowBtn} onClick={() => setEditing(true)}>
          <Pencil size={13} />
        </button>
        <button
          type="button"
          aria-label="Export as Markdown"
          title="Export as Markdown"
          className={rowBtn}
          onClick={async () => {
            const chat = await loadChat(c.id);
            if (chat) downloadMarkdown(chat);
          }}
        >
          <Download size={13} />
        </button>
        <button type="button" aria-label={c.pinned ? "Unpin" : "Pin"} title={c.pinned ? "Unpin" : "Pin"} className={rowBtn} onClick={() => setPinned(c.id, !c.pinned)}>
          {c.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <ConfirmButton
          aria-label="Delete"
          title="Delete"
          className="rounded p-1.5 text-muted hover:bg-line hover:text-danger"
          confirmLabel={<span className="px-1 text-[11px] text-danger">Delete?</span>}
          onConfirm={() => deleteChat(c.id)}
        >
          <Trash2 size={13} />
        </ConfirmButton>
      </div>
    </li>
  );
}

export function History({ activeId, onOpen }: { activeId?: string; onOpen: (id: string) => void }) {
  const chats = useChatList();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Set<string>>();

  // Search titles and message text (debounced, since it reads every chat).
  useEffect(() => {
    if (!q.trim()) return setHits(undefined);
    let live = true;
    const t = setTimeout(() => searchChats(q).then((h) => live && setHits(h)), 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, chats]);

  const filtered = useMemo(
    () => (q.trim() ? chats.filter((c) => hits?.has(c.id) ?? c.title.toLowerCase().includes(q.toLowerCase())) : chats),
    [chats, q, hits],
  );
  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-1 pb-2">
        <label className="flex items-center gap-2 rounded-lg border border-transparent bg-elevated px-3 py-2 focus-within:border-muted">
          <Search size={15} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats and messages"
            className="w-full bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {pinned.length > 0 && (
          <>
            <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted">Pinned</h3>
            <ul>
              {pinned.map((c) => (
                <Row key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} />
              ))}
            </ul>
          </>
        )}
        <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted">{q.trim() ? "Results" : "Recents"}</h3>
        {recent.length ? (
          <ul>
            {recent.map((c) => (
              <Row key={c.id} c={c} active={c.id === activeId} onOpen={onOpen} />
            ))}
          </ul>
        ) : (
          <p className="px-3 py-2 text-muted">{q ? "No chats match." : "No chats yet."}</p>
        )}
      </div>
    </div>
  );
}
