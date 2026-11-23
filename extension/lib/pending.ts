import { browser } from "wxt/browser";
import type { Attachment } from "./chats";

/** Hand-off from the right-click menu (background) to the sidebar. */
export interface PendingAction {
  id: string;
  /** "ask" pre-fills the composer; "send" sends immediately. */
  mode: "ask" | "send";
  text?: string;
  attachments: Attachment[];
  createdAt: number;
}

export const PENDING_KEY = "pendingAction";

export async function takePending(): Promise<PendingAction | undefined> {
  const res = await browser.storage.local.get(PENDING_KEY);
  const p = res[PENDING_KEY] as PendingAction | undefined;
  if (!p) return undefined;
  await browser.storage.local.remove(PENDING_KEY);
  // Ignore stale hand-offs (e.g. sidebar was closed when the menu was used long ago).
  return Date.now() - p.createdAt < 60_000 ? p : undefined;
}
