import type { Attachment, Message } from "./chats";

function attr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function renderAttachments(atts: Attachment[] = []): string {
  return atts
    .map((a) =>
      a.kind === "page"
        ? `<page title="${attr(a.title ?? "")}" url="${attr(a.url ?? "")}">\n${a.text}\n</page>`
        : `<selection${a.url ? ` url="${attr(a.url)}"` : ""}>\n${a.text}\n</selection>`,
    )
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
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.role === "user" ? renderTurn(m.text, m.attachments) : m.text}`);
  return turns.length ? `<conversation_so_far>\n${turns.join("\n\n")}\n</conversation_so_far>\n\n` : "";
}

export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 57) + "…" : t || "New chat";
}
