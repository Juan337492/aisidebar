import type { Adapter, ChatEvent, ChatRequest, ModelOption, ProviderStatus } from "../types.ts";
import { parseJson, run, streamLines, watchLogin, which } from "../process.ts";
import { normalizeUsage, systemPrompt, validImages, writeImages } from "../prompt.ts";

// Codex picks the newest ChatGPT model for your plan by default; effort maps to model_reasoning_effort.
const MODELS: ModelOption[] = [
  { id: "default", name: "ChatGPT (Codex default)", efforts: ["low", "medium", "high"], defaultEffort: "medium" },
];

/** Uses OpenAI's Codex CLI, signed in with your ChatGPT account (Plus, Pro, Team…). */
export function codexAdapter(getBinaryOverride: () => string | undefined): Adapter {
  let cached: { at: number; value: ProviderStatus } | undefined;
  const binary = () => getBinaryOverride() ?? which("codex");

  return {
    id: "codex",
    displayName: "ChatGPT (Codex)",

    async status(force = false) {
      if (!force && cached && Date.now() - cached.at < 60_000) return cached.value;
      const bin = binary();
      const base: ProviderStatus = {
        id: "codex",
        displayName: "ChatGPT (Codex)",
        kind: "ChatGPT account via Codex CLI",
        installed: false,
        authenticated: false,
        models: MODELS,
        installUrl: "https://developers.openai.com/codex/cli",
        signInLabel: "Sign in with ChatGPT",
        canSignOut: true,
        images: true,
      };
      if (!bin) {
        return (cached = {
          at: Date.now(),
          value: { ...base, message: "Codex CLI isn't installed. Install it (npm install -g @openai/codex), then click refresh." },
        }).value;
      }
      const [ver, auth] = await Promise.all([run(bin, ["--version"]), run(bin, ["login", "status"])]);
      const text = `${auth.stdout}\n${auth.stderr}`;
      const loggedIn = auth.code === 0 && !/not logged in/i.test(text);
      const value: ProviderStatus = {
        ...base,
        installed: true,
        binary: bin,
        version: ver.stdout.trim().split(/\s+/).pop() || undefined,
        authenticated: loggedIn,
        account: loggedIn ? (/api key/i.test(text) ? "OpenAI API key" : "ChatGPT account") : undefined,
        message: loggedIn ? undefined : "Not signed in. Click Sign in to log in with your ChatGPT account.",
      };
      cached = { at: Date.now(), value };
      return value;
    },

    login() {
      const bin = binary();
      if (!bin) throw new Error("Codex CLI isn't installed.");
      cached = undefined;
      // Opens OpenAI's own sign-in page in the browser and waits for it to finish.
      return watchLogin(bin, ["login"]);
    },

    async logout() {
      const bin = binary();
      if (!bin) throw new Error("Codex CLI isn't installed.");
      cached = undefined;
      const r = await run(bin, ["logout"]);
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || "Sign-out failed.");
    },

    async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
      const bin = binary();
      if (!bin) throw new Error("Codex CLI isn't installed.");
      // No system-prompt flag, so the instructions ride along with the first turn of each conversation.
      const prompt = req.sessionId ? req.prompt : `<instructions>\n${systemPrompt(req)}\n</instructions>\n\n${req.prompt}`;
      const images = writeImages(validImages(req.images));
      // Read-only sandbox in the empty workspace: it can't change anything on your computer.
      const args = ["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only"];
      if (req.model && req.model !== "default") args.push("--model", req.model);
      if (req.effort) args.push("-c", `model_reasoning_effort="${req.effort}"`);
      for (const p of images.paths) args.push("--image", p);
      // "-" = read the prompt from stdin, so page text of any size works on every OS.
      args.push(...(req.sessionId ? ["resume", req.sessionId, "-"] : ["-"]));

      try {
        let sentSession = false;
        for await (const line of streamLines(bin, args, signal, prompt)) {
          const ev = parseJson(line);
          if (!ev) continue;
          if (ev.type === "thread.started" && typeof ev.thread_id === "string" && !sentSession) {
            sentSession = true;
            yield { type: "session", id: ev.thread_id };
          } else if (ev.type === "item.completed" || ev.type === "item.updated" || ev.type === "item.started") {
            const item = ev.item ?? {};
            if (ev.type === "item.completed" && item.type === "agent_message" && item.text) {
              yield { type: "text", delta: item.text };
            } else if (ev.type === "item.completed" && item.type === "reasoning" && item.text) {
              yield { type: "thinking", delta: item.text + "\n\n" };
            } else if (ev.type === "item.started" && item.type && item.type !== "agent_message") {
              yield { type: "status", text: String(item.type).replace(/_/g, " ") };
            }
          } else if (ev.type === "turn.completed") {
            yield { type: "done", usage: normalizeUsage(ev.usage) };
            return;
          } else if (ev.type === "turn.failed" || ev.type === "error") {
            yield { type: "error", message: String(ev.error?.message ?? ev.message ?? "Codex returned an error") };
            return;
          }
        }
        yield { type: "done" };
      } finally {
        images.cleanup();
      }
    },
  };
}
