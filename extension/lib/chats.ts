import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

export interface Attachment {
  kind: "page" | "selection";
  title?: string;
  url?: string;
  text: string;
  truncated?: boolean;
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
