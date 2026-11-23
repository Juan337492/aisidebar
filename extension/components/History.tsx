import { useMemo, useState } from "react";
import { Pin, PinOff, Search, Trash2 } from "lucide-react";
import { deleteChat, setPinned, useChatList, type ChatMeta } from "@/lib/chats";
import { timeAgo } from "./ui";

export function History({ activeId, onOpen }: { activeId?: string; onOpen: (id: string) => void }) {
  const chats = useChatList();
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => chats.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())),
    [chats, q],
  );
  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  const Row = ({ c }: { c: ChatMeta }) => (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(c.id)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-elevated ${
          c.id === activeId ? "bg-elevated" : ""
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{c.title}</span>
        <span className="shrink-0 text-[11px] text-muted group-hover:invisible">{timeAgo(c.updatedAt)}</span>
      </button>
      <div className="absolute top-1/2 right-1 hidden -translate-y-1/2 gap-0.5 group-hover:flex group-focus-within:flex">
        <button
          type="button"
          aria-label={c.pinned ? "Unpin" : "Pin"}
          title={c.pinned ? "Unpin" : "Pin"}
          className="rounded p-1.5 text-muted hover:bg-line hover:text-fg"
          onClick={() => setPinned(c.id, !c.pinned)}
        >
          {c.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <button
          type="button"
          aria-label="Delete"
          title="Delete"
          className="rounded p-1.5 text-muted hover:bg-line hover:text-danger"
          onClick={() => confirm(`Delete “${c.title}”?`) && deleteChat(c.id)}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pt-1 pb-2">
        <label className="flex items-center gap-2 rounded-lg border border-transparent bg-elevated px-3 py-2 focus-within:border-muted">
          <Search size={15} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent outline-none placeholder:text-muted focus-visible:outline-none"
          />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {pinned.length > 0 && (
          <>
            <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted">Pinned</h3>
            <ul>{pinned.map((c) => <Row key={c.id} c={c} />)}</ul>
          </>
        )}
        <h3 className="px-3 pt-3 pb-1 text-xs font-medium text-muted">Recents</h3>
        {recent.length ? (
          <ul>{recent.map((c) => <Row key={c.id} c={c} />)}</ul>
        ) : (
          <p className="px-3 py-2 text-muted">{q ? "No chats match." : "No chats yet."}</p>
        )}
      </div>
    </div>
  );
}
