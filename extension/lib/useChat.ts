import { useCallback, useRef, useState } from "react";
import { newId, saveChat, type Attachment, type Chat, type Message } from "./chats";
import { streamChat } from "./companion";
import { markRepeats, renderTranscript, renderTurn, titleFrom } from "./prompt";
import type { Settings } from "./settings";
import type { ChatImage } from "./types";

export interface Target {
  provider: string;
  model?: string;
  effort?: string;
}

function emptyChat(): Chat {
  const now = Date.now();
  return { id: newId(), title: "New chat", createdAt: now, updatedAt: now, sessions: {}, messages: [] };
}

function toImage(a: Attachment): ChatImage | undefined {
  const m = a.dataUrl?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  return m ? { mediaType: m[1] as ChatImage["mediaType"], data: m[2]! } : undefined;
}

/** Owns the open conversation: sending, streaming, stopping, retrying, persisting. */
export function useChat() {
  const [chat, setChat] = useState<Chat>(emptyChat);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const show = (c: Chat) => {
    chatRef.current = c;
    setChat(c);
  };

  /**
   * Sends one turn on `base` (a chat snapshot). The streaming reply is applied to its own copy of that chat,
   * and only shown while that chat is still the open one, so switching chats mid-reply can't save the reply
   * into the wrong chat.
   */
  const run = async (settings: Settings, target: Target, base: Chat, text: string, attachments: Attachment[]) => {
    if (abortRef.current) return;
    const history = base.messages;
    const now = Date.now();
    const atts = markRepeats(history, attachments);
    const user: Message = { id: newId(), role: "user", text, attachments: atts, createdAt: now };
    const asst: Message = { id: newId(), role: "assistant", text: "", createdAt: now, ...target };
    let working: Chat = {
      ...base,
      title: base.messages.length ? base.title : titleFrom(text),
      updatedAt: now,
      messages: [...base.messages, user, asst],
    };
    const apply = (fn: (c: Chat) => Chat) => {
      working = fn(working);
      if (chatRef.current.id === working.id) show(working);
    };
    const patchLast = (fn: (m: Message) => Message) =>
      apply((c) => ({ ...c, messages: [...c.messages.slice(0, -1), fn(c.messages[c.messages.length - 1]!)] }));
    show(working);

    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setStatus("Thinking…");
    const images = atts.map(toImage).filter((i): i is ChatImage => !!i);

    const turn = async (sessionId: string | undefined) => {
      const prompt = (sessionId ? "" : renderTranscript(history)) + renderTurn(text, atts);
      let gotText = false;
      for await (const ev of streamChat(
        settings,
        {
          provider: target.provider,
          model: target.model,
          effort: target.effort,
          sessionId,
          prompt,
          system: settings.instructions || undefined,
          images: images.length ? images : undefined,
        },
        ac.signal,
      )) {
        if (ev.type === "session") {
          apply((c) => ({ ...c, sessions: { ...c.sessions, [target.provider]: ev.id } }));
        } else if (ev.type === "text") {
          gotText = true;
          setStatus(undefined);
          patchLast((m) => ({ ...m, text: m.text + ev.delta }));
        } else if (ev.type === "thinking") {
          patchLast((m) => ({ ...m, thinking: (m.thinking ?? "") + ev.delta }));
        } else if (ev.type === "status") {
          if (!gotText && ev.text) setStatus(ev.text.charAt(0).toUpperCase() + ev.text.slice(1) + "…");
        } else if (ev.type === "done") {
          if (ev.usage) patchLast((m) => ({ ...m, usage: ev.usage }));
        } else if (ev.type === "error") {
          // A stale provider session (e.g. deleted on disk): start fresh with the transcript once.
          if (sessionId && !gotText) return "retry";
          patchLast((m) => ({ ...m, error: ev.message }));
        }
      }
      return "ok";
    };

    try {
      const sid = working.sessions[target.provider];
      if ((await turn(sid)) === "retry") {
        apply((c) => {
          const { [target.provider]: _, ...rest } = c.sessions;
          return { ...c, sessions: rest };
        });
        await turn(undefined);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus(undefined);
      apply((c) => ({ ...c, updatedAt: Date.now() }));
      await saveChat(working);
    }
  };

  const send = useCallback(
    (settings: Settings, target: Target, text: string, attachments: Attachment[] = []) =>
      run(settings, target, chatRef.current, text, attachments),
    [],
  );

  /**
   * Drops the conversation from message `index` on. Provider sessions are cleared, so the next turn
   * replays only what's left instead of continuing a provider-side history that still has the removed turns.
   */
  const truncate = (index: number): Chat => ({
    ...chatRef.current,
    sessions: {},
    messages: chatRef.current.messages.slice(0, index),
  });

  /** Asks again for the last answer (optionally with another model). */
  const regenerate = useCallback(async (settings: Settings, target: Target) => {
    if (abortRef.current) return;
    const msgs = chatRef.current.messages;
    const i = msgs.map((m) => m.role).lastIndexOf("user");
    if (i < 0) return;
    const { text, attachments } = msgs[i]!;
    // Sessions are cleared, so earlier turns (with any page they shared) are replayed in full.
    await run(settings, target, truncate(i), text, attachments ?? []);
  }, []);

  /** Removes a user message and everything after it, returning it so the composer can be pre-filled. */
  const editFrom = useCallback((messageId: string): Message | undefined => {
    if (abortRef.current) return;
    const i = chatRef.current.messages.findIndex((m) => m.id === messageId);
    if (i < 0) return;
    const m = chatRef.current.messages[i];
    const next = truncate(i);
    show(next);
    void saveChat(next);
    return m;
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const open = useCallback((c: Chat) => {
    // The reply in progress is stopped, but it's saved to its own chat (see run).
    abortRef.current?.abort();
    show(c);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    show(emptyChat());
  }, []);

  const rename = useCallback((title: string) => {
    if (!title.trim()) return;
    const next = { ...chatRef.current, title: title.trim() };
    show(next);
    if (next.messages.length) void saveChat(next);
  }, []);

  return { chat, busy, status, send, regenerate, editFrom, stop, open, reset, rename };
}
