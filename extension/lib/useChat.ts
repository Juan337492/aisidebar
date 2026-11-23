import { useCallback, useRef, useState } from "react";
import { newId, saveChat, type Attachment, type Chat, type Message } from "./chats";
import { streamChat } from "./companion";
import { renderTranscript, renderTurn, titleFrom } from "./prompt";
import type { Settings } from "./settings";

export interface Target {
  provider: string;
  model?: string;
  effort?: string;
}

function emptyChat(): Chat {
  const now = Date.now();
  return { id: newId(), title: "New chat", createdAt: now, updatedAt: now, sessions: {}, messages: [] };
}

/** Owns the open conversation: sending, streaming, stopping, persisting. */
export function useChat() {
  const [chat, setChat] = useState<Chat>(emptyChat);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const update = (fn: (c: Chat) => Chat) => {
    chatRef.current = fn(chatRef.current);
    setChat(chatRef.current);
  };

  const patchLast = (fn: (m: Message) => Message) =>
    update((c) => {
      const last = c.messages[c.messages.length - 1];
      return last ? { ...c, messages: [...c.messages.slice(0, -1), fn(last)] } : c;
    });

  const send = useCallback(async (settings: Settings, target: Target, text: string, attachments: Attachment[] = []) => {
    if (abortRef.current) return;
    const history = chatRef.current.messages;
    const now = Date.now();
    const user: Message = { id: newId(), role: "user", text, attachments, createdAt: now };
    const asst: Message = { id: newId(), role: "assistant", text: "", createdAt: now, ...target };
    update((c) => ({
      ...c,
      title: c.messages.length ? c.title : titleFrom(text),
      updatedAt: now,
      messages: [...c.messages, user, asst],
    }));

    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setStatus("Thinking…");

    const run = async (sessionId: string | undefined) => {
      const prompt = (sessionId ? "" : renderTranscript(history)) + renderTurn(text, attachments);
      let gotText = false;
      for await (const ev of streamChat(
        settings,
        { provider: target.provider, model: target.model, effort: target.effort, sessionId, prompt, system: settings.instructions || undefined },
        ac.signal,
      )) {
        if (ev.type === "session") {
          update((c) => ({ ...c, sessions: { ...c.sessions, [target.provider]: ev.id } }));
        } else if (ev.type === "text") {
          gotText = true;
          setStatus(undefined);
          patchLast((m) => ({ ...m, text: m.text + ev.delta }));
        } else if (ev.type === "thinking") {
          patchLast((m) => ({ ...m, thinking: (m.thinking ?? "") + ev.delta }));
        } else if (ev.type === "status") {
          if (!gotText && ev.text) setStatus(ev.text.charAt(0).toUpperCase() + ev.text.slice(1) + "…");
        } else if (ev.type === "error") {
          // A stale provider session (e.g. deleted on disk): start fresh with the transcript once.
          if (sessionId && !gotText) return "retry";
          patchLast((m) => ({ ...m, error: ev.message }));
        }
      }
      return "ok";
    };

    try {
      const sid = chatRef.current.sessions[target.provider];
      if ((await run(sid)) === "retry") {
        update((c) => {
          const { [target.provider]: _, ...rest } = c.sessions;
          return { ...c, sessions: rest };
        });
        await run(undefined);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patchLast((m) => ({ ...m, error: (e as Error).message }));
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus(undefined);
      update((c) => ({ ...c, updatedAt: Date.now() }));
      await saveChat(chatRef.current);
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const open = useCallback((c: Chat) => {
    abortRef.current?.abort();
    update(() => c);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    update(() => emptyChat());
  }, []);

  return { chat, busy, status, send, stop, open, reset };
}
