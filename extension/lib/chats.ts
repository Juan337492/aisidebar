import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

export interface Attachment {
  kind: "page" | "selection" | "image";
  title?: string;
  url?: string;
  /** Page or selection text. Empty for images, and for a page already sent earlier in the chat (see `repeat`). */
  text: string;
  truncated?: boolean;
  /** Content hash of a page, so re-sending the same unchanged page can be skipped. */
  hash?: string;
  /** This page was already sent earlier in the chat and hasn't changed, so its text isn't sent again. */
  repeat?: boolean;
  /** Images: a data: URL (JPEG/PNG). */
  dataUrl?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  attachments?: Attachment[];
  provider?: string;
  model?: string;
  effort?: string;
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  createdAt: number;
}

export interface ChatMeta {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
}

export interface Chat extends ChatMeta {
  createdAt: number;
  /** Provider-side session ids, so each provider continues its own conversation. */
  sessions: Record<string, string>;
  messages: Message[];
}

const INDEX = "chatIndex";
const chatKey = (id: string) => `chat:${id}`;

export const newId = () => crypto.randomUUID();

export async function listChats(): Promise<ChatMeta[]> {
  const res = await browser.storage.local.get(INDEX);
  return ((res[INDEX] as ChatMeta[] | undefined) ?? []).sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt,
  );
}

export async function loadChat(id: string): Promise<Chat | undefined> {
  const res = await browser.storage.local.get(chatKey(id));
  return res[chatKey(id)] as Chat | undefined;
}

export async function saveChat(chat: Chat): Promise<void> {
  const index = (await listChats()).filter((c) => c.id !== chat.id);
  const meta: ChatMeta = { id: chat.id, title: chat.title, updatedAt: chat.updatedAt, pinned: chat.pinned };
  await browser.storage.local.set({ [chatKey(chat.id)]: chat, [INDEX]: [meta, ...index] });
}

export async function deleteChat(id: string): Promise<void> {
  const index = (await listChats()).filter((c) => c.id !== id);
  await browser.storage.local.remove(chatKey(id));
  await browser.storage.local.set({ [INDEX]: index });
}

export async function deleteAllChats(): Promise<void> {
  const index = await listChats();
  await browser.storage.local.remove([INDEX, ...index.map((c) => chatKey(c.id))]);
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const chat = await loadChat(id);
  if (chat) await saveChat({ ...chat, pinned });
}

export async function renameChat(id: string, title: string): Promise<void> {
  const chat = await loadChat(id);
  if (chat && title.trim()) await saveChat({ ...chat, title: title.trim() });
}

/** Full-text search: chat ids whose title, messages or attached page titles/URLs contain every word of `q`. */
export async function searchChats(q: string): Promise<Set<string>> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const index = await listChats();
  const all = await browser.storage.local.get(index.map((c) => chatKey(c.id)));
  const hits = new Set<string>();
  for (const meta of index) {
    const chat = all[chatKey(meta.id)] as Chat | undefined;
    if (!chat) continue;
    const hay = [
      chat.title,
      ...chat.messages.flatMap((m) => [m.text, ...(m.attachments ?? []).flatMap((a) => [a.title ?? "", a.url ?? ""])]),
    ]
      .join("\n")
      .toLowerCase();
    if (words.every((w) => hay.includes(w))) hits.add(meta.id);
  }
  return hits;
}

/** The chat as a Markdown document. */
export function chatToMarkdown(chat: Chat, modelName?: (m: Message) => string | undefined): string {
  const lines = [`# ${chat.title}`, "", `_Exported from AI Sidebar · ${new Date(chat.updatedAt).toLocaleString()}_`, ""];
  for (const m of chat.messages) {
    if (m.role === "user") {
      lines.push("## You", "");
      for (const a of m.attachments ?? []) {
        if (a.kind === "page") lines.push(`> 📄 [${a.title || a.url}](${a.url})`, "");
        else if (a.kind === "image") lines.push(`> 🖼️ ${a.title ?? "Image"}`, "");
        else lines.push(...a.text.split("\n").map((l) => `> ${l}`), "");
      }
      lines.push(m.text, "");
    } else {
      lines.push(`## ${modelName?.(m) ?? m.model ?? "Assistant"}`, "", m.text || (m.error ? `_Error: ${m.error}_` : ""), "");
    }
  }
  return lines.join("\n");
}

export function downloadMarkdown(chat: Chat, modelName?: (m: Message) => string | undefined) {
  const blob = new Blob([chatToMarkdown(chat, modelName)], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${chat.title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "chat"}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function useChatList(): ChatMeta[] {
  const [list, setList] = useState<ChatMeta[]>([]);
  useEffect(() => {
    listChats().then(setList);
    const onChange = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && INDEX in changes) listChats().then(setList);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return list;
}
