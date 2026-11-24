import type { Adapter, ChatEvent, ChatRequest, ModelOption, ProviderStatus } from "../types.ts";
import { normalizeUsage, systemPrompt, validImages } from "../prompt.ts";

/** Ollama's local server. Override with "ollamaUrl" in ~/.aisidebar/config.json or OLLAMA_HOST. */
export function ollamaBaseUrl(configured?: string): string {
  const raw = configured ?? process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Local models through Ollama: free, private, no account. Each turn sends the conversation so far. */
export function ollamaAdapter(getUrl: () => string | undefined): Adapter {
  let cached: { at: number; value: ProviderStatus } | undefined;
  const url = () => ollamaBaseUrl(getUrl());

  return {
    id: "ollama",
    displayName: "Local models (Ollama)",

    async status(force = false) {
      if (!force && cached && Date.now() - cached.at < 30_000) return cached.value;
      const base: ProviderStatus = {
        id: "ollama",
        displayName: "Local models (Ollama)",
        kind: "Models running on this computer",
        installed: false,
        authenticated: false,
        models: [],
        installUrl: "https://ollama.com/download",
        images: true,
      };
      let value: ProviderStatus;
      try {
        const [tags, ver] = await Promise.all([
          fetch(`${url()}/api/tags`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()),
          fetch(`${url()}/api/version`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => ({})),
        ]);
        const models: ModelOption[] = ((tags?.models ?? []) as { name: string }[])
          .map((m) => ({ id: m.name, name: m.name.replace(/:latest$/, ""), efforts: [] }))
          .sort((a, b) => a.name.localeCompare(b.name));
        value = {
          ...base,
          installed: true,
          binary: url(),
          version: typeof ver?.version === "string" ? ver.version : undefined,
          authenticated: models.length > 0,
          account: models.length ? "No account needed" : undefined,
          models,
          message: models.length ? undefined : "Ollama is running but has no models. Run e.g. `ollama pull llama3.2`, then refresh.",
        };
      } catch {
        value = { ...base, message: `Ollama isn't running at ${url()}. Install and open Ollama, then refresh.` };
      }
      cached = { at: Date.now(), value };
      return value;
    },

    async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
      const images = validImages(req.images).map((i) => i.data);
      const res = await fetch(`${url()}/api/chat`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: req.model,
          stream: true,
          messages: [
            { role: "system", content: systemPrompt(req) },
            { role: "user", content: req.prompt, ...(images.length ? { images } : {}) },
          ],
        }),
      }).catch((e: Error) => {
        if (e.name === "AbortError") throw e;
        throw new Error(`Can't reach Ollama at ${url()}. Is it running?`);
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(String(body.error ?? `Ollama error ${res.status}`));
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let ev: any;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.error) {
            yield { type: "error", message: String(ev.error) };
            return;
          }
          if (ev.message?.thinking) yield { type: "thinking", delta: ev.message.thinking };
          if (ev.message?.content) yield { type: "text", delta: ev.message.content };
          if (ev.done) {
            yield { type: "done", usage: normalizeUsage(ev) };
            return;
          }
        }
      }
      yield { type: "done" };
    },
  };
}
