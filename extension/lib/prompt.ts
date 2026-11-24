import type { Attachment, Message } from "./chats";

function attr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function renderAttachments(atts: Attachment[] = []): string {
  return atts
    .map((a) => {
      if (a.kind === "image") return ""; // sent separately as an image
      if (a.kind === "selection") return `<selection${a.url ? ` url="${attr(a.url)}"` : ""}>\n${a.text}\n</selection>`;
      const head = `<page title="${attr(a.title ?? "")}" url="${attr(a.url ?? "")}"`;
      return a.repeat ? `${head} unchanged="true">(Same page as shared earlier in this conversation.)</page>` : `${head}>\n${a.text}\n</page>`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function renderTurn(text: string, atts?: Attachment[]): string {
  const ctx = renderAttachments(atts);
  return ctx ? `${ctx}\n\n${text}` : text;
}

/**
 * Used when a provider has no session for this chat yet (e.g. you switched from Claude to Gemini
 * mid-conversation): replays the earlier turns so the new provider has the context.
 */
export function renderTranscript(history: Message[]): string {
  const turns = history
    .filter((m) => m.text && !m.error)
    .map((m) => {
      if (m.role !== "user") return `Assistant: ${m.text}`;
      // "Unchanged" page markers are fine here: the page's full text appears earlier in the same replay.
      const images = (m.attachments ?? []).filter((a) => a.kind === "image").length;
      const note = images ? `\n[The user attached ${images === 1 ? "an image" : `${images} images`} here; not shown again.]` : "";
      return `User: ${renderTurn(m.text, m.attachments)}${note}`;
    });
  return turns.length ? `<conversation_so_far>\n${turns.join("\n\n")}\n</conversation_so_far>\n\n` : "";
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t || "New chat";
}

/** FNV-1a: a fast fingerprint of page text, to notice when the same page is sent again unchanged. */
export function hashText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/**
 * Pages already sent earlier in this chat (same URL and content) are marked `repeat` so their text
 * isn't sent and stored again on every follow-up.
 */
export function markRepeats(history: Message[], atts: Attachment[]): Attachment[] {
  const sent = new Set<string>();
  history.forEach((m, i) => {
    // Only count turns that got an answer; a failed turn may never have reached the AI.
    const answered = history[i + 1]?.role === "assistant" && !history[i + 1]?.error && !!history[i + 1]?.text;
    if (m.role === "user" && answered) for (const a of m.attachments ?? []) if (a.kind === "page" && a.hash && !a.repeat) sent.add(a.hash);
  });
  return atts.map((a) => (a.kind === "page" && a.hash && sent.has(a.hash) ? { ...a, text: "", repeat: true } : a));
}

/** Rough token count for a usage line ("1.2k tokens"). */
export function formatTokens(n?: number): string | undefined {
  if (n === undefined) return undefined;
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}
