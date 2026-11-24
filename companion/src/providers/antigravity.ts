import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, ChatEvent, ChatRequest, LoginProcess, ModelOption, ProviderStatus } from "../types.ts";
import { startAcp } from "../acp.ts";
import { IS_WINDOWS, isExecutable, parseJson, run, streamLines, which } from "../process.ts";
import { normalizeUsage, systemPrompt, validImages, writeImages } from "../prompt.ts";

const EFFORT_ORDER = ["low", "medium", "high", "xhigh"];

/** Antigravity's CLI as installed by T3 Code, if it isn't on PATH. */
export function t3Binary(home = homedir()): string | undefined {
  try {
    const dir = join(home, ".t3", "tools", "antigravity-acp", `${process.platform}-${process.arch}`);
    const { releaseId } = JSON.parse(readFileSync(join(dir, "active.json"), "utf8"));
    const done = JSON.parse(readFileSync(join(dir, "versions", releaseId, ".install-complete.json"), "utf8"));
    // The file name differs between platforms and releases, so use the one the install recorded.
    const names = [done?.executable?.name, "antigravity", "agy"].filter((n): n is string => typeof n === "string" && !!n);
    const files = names.flatMap((n) => (IS_WINDOWS && !/\.exe$/i.test(n) ? [`${n}.exe`, n] : [n]));
    return files.map((f) => join(dir, "versions", releaseId, f)).find(isExecutable);
  } catch {
    return undefined;
  }
}

/**
 * Turns `gemini-4-neon-high  Gemini 4 Neon (High)` lines into one model per family
 * with its effort levels, so the UI can show a model picker plus an effort picker.
 */
export function parseModels(stdout: string): ModelOption[] {
  const families = new Map<string, ModelOption>();
  for (const raw of stdout.split("\n")) {
    const [slug, name] = raw.split("\t").map((s) => s?.trim());
    if (!slug || !name) continue;
    const m = slug.match(/^(.*)-(low|medium|high|xhigh)$/);
    if (!m) {
      families.set(slug, { id: slug, name, efforts: [] });
      continue;
    }
    const [, base, effort] = m;
    const fam = families.get(base) ?? { id: base, name: name.replace(/\s*\([^)]*\)\s*$/, ""), efforts: [] };
    fam.efforts.push(effort);
    families.set(base, fam);
  }
  for (const f of families.values()) {
    f.efforts.sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b));
    if (f.efforts.length) f.defaultEffort = f.efforts.includes("high") ? "high" : f.efforts[f.efforts.length - 1];
  }
  return [...families.values()];
}

/** Uses Google Antigravity's CLI, signed in with your Google account (Gemini subscription). */
export function antigravityAdapter(getBinaryOverride: () => string | undefined): Adapter {
  let cached: { at: number; value: ProviderStatus } | undefined;
  const binary = () => getBinaryOverride() ?? which("agy") ?? which("antigravity") ?? t3Binary();

  return {
    id: "antigravity",
    displayName: "Gemini (Antigravity)",

    async status(force = false) {
      if (!force && cached && Date.now() - cached.at < 5 * 60_000) return cached.value;
      const bin = binary();
      const base: ProviderStatus = {
        id: "antigravity",
        displayName: "Gemini (Antigravity)",
        kind: "Google account via Antigravity CLI",
        installed: false,
        authenticated: false,
        models: [],
        installUrl: "https://antigravity.google/download",
        signInLabel: "Sign in with Google",
        canSignOut: true,
        images: true,
      };
      if (!bin) {
        return (cached = {
          at: Date.now(),
          value: {
            ...base,
            message: IS_WINDOWS
              ? "Antigravity CLI (agy) not found. The desktop app doesn't include it: in PowerShell run  irm https://antigravity.google/cli/install.ps1 | iex  then click the refresh button next to Providers."
              : "Antigravity CLI (agy) not found. The desktop app doesn't include it: in a terminal run  curl -fsSL https://antigravity.google/cli/install.sh | bash  then click the refresh button next to Providers.",
          },
        }).value;
      }
      const [ver, models] = await Promise.all([run(bin, ["--version"]), run(bin, ["models"], 45_000)]);
      const parsed = models.code === 0 ? parseModels(models.stdout) : [];
      const value: ProviderStatus = {
        ...base,
        installed: true,
        binary: bin,
        version: ver.stdout.trim().split(/\s+/).pop() || undefined,
        authenticated: parsed.length > 0,
        account: parsed.length > 0 ? "Google account" : undefined,
        models: parsed,
        message:
          parsed.length > 0
            ? undefined
            : "Not signed in. Click Sign in to log in with your Google account.",
      };
      cached = { at: Date.now(), value };
      return value;
    },

    login(): LoginProcess {
      const bin = binary();
      if (!bin) throw new Error("Antigravity CLI not found.");
      cached = undefined;
      const acp = startAcp(bin);
      let urlCb: ((u: string) => void) | undefined;
      let seen: string | undefined;
      acp.onOutput((text) => {
        const m = text.match(/https:\/\/[^\s"'<>)\]]+/);
        if (m && !seen && /google|accounts|oauth|antigravity/.test(m[0])) {
          seen = m[0];
          urlCb?.(seen);
        }
      });
      const timer = setTimeout(() => acp.close(), 10 * 60_000);
      // Opens Google's own sign-in page in the browser; resolves once you've finished there.
      const done = acp
        .initialize()
        .then(() => acp.request("authenticate", { methodId: "oauth-personal" }))
        .then(() => undefined)
        .finally(() => {
          clearTimeout(timer);
          acp.close();
        });
      return {
        done,
        onUrl(cb) {
          urlCb = cb;
          if (seen) cb(seen);
        },
        cancel: () => acp.close(),
      };
    },

    async logout() {
      const bin = binary();
      if (!bin) throw new Error("Antigravity CLI not found.");
      cached = undefined;
      const acp = startAcp(bin);
      try {
        await acp.initialize();
        try {
          await acp.request("logout", {});
        } catch (e) {
          // Method name differs between ACP revisions.
          if ((e as { code?: number }).code !== -32601) throw e;
          await acp.request("auth/logout", {});
        }
      } finally {
        acp.close();
      }
    },

    async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
      const bin = binary();
      if (!bin) throw new Error("Antigravity CLI not found.");
      // No system-prompt flag, so the instructions ride along with the first turn of each conversation.
      let prompt = req.sessionId ? req.prompt : `<instructions>\n${systemPrompt(req)}\n</instructions>\n\n${req.prompt}`;
      // Its stream input only takes text, so screenshots go in as files it can open (in the empty workspace).
      const images = writeImages(validImages(req.images));
      if (images.paths.length) {
        prompt =
          `The user attached ${images.paths.length === 1 ? "an image" : "images"} for this message. ` +
          `Open ${images.paths.length === 1 ? "it" : "them"} to see ${images.paths.length === 1 ? "it" : "them"} before answering:\n` +
          images.paths.map((p) => `- ${p}`).join("\n") +
          `\n\n${prompt}`;
      }
      // The prompt goes in on stdin as one stream-json message, so page text of any size works on every OS.
      const args = ["--input-format", "stream-json", "--output-format", "stream-json", "--disable-slash-commands", "--sandbox"];
      const input = JSON.stringify({ event: "user", message: { content: prompt } }) + "\n";
      if (req.model) args.push("--model", req.effort ? `${req.model}-${req.effort}` : req.model);
      if (req.sessionId) args.push("--conversation", req.sessionId);

      try {
        yield* streamEvents(bin, args, signal, input);
      } finally {
        images.cleanup();
      }
    },
  };
}

/** Turns Antigravity's stream-json output into sidebar chat events. */
async function* streamEvents(bin: string, args: string[], signal: AbortSignal, input: string): AsyncGenerator<ChatEvent> {
  let sentSession = false;
  for await (const line of streamLines(bin, args, signal, input)) {
    const ev = parseJson(line);
    if (!ev) continue;
    const convId = ev.conversation_id ?? ev.step_update?.conversation_id ?? ev.result?.conversation_id;
    if (!sentSession && typeof convId === "string" && convId) {
      sentSession = true;
      yield { type: "session", id: convId };
    }
    if (ev.event === "step_update") {
      const s = ev.step_update ?? {};
      if (s.step_type === "agent_response") {
        if (s.thinking_delta) yield { type: "thinking", delta: s.thinking_delta };
        if (s.text_delta) yield { type: "text", delta: s.text_delta };
      } else if (s.state === "ACTIVE" && s.step_type && s.step_type !== "user_input") {
        yield { type: "status", text: s.step_type === "tool" ? "working" : String(s.step_type).replace(/_/g, " ") };
      }
    } else if (ev.event === "result") {
      const r = ev.result ?? {};
      if (r.status && r.status !== "SUCCESS") {
        yield { type: "error", message: String(r.error ?? r.response ?? `Antigravity: ${r.status}`) };
      } else {
        yield { type: "done", usage: normalizeUsage(r.usage) };
      }
      return;
    } else if (ev.event === "error") {
      yield { type: "error", message: String(ev.error?.message ?? ev.message ?? "Antigravity error") };
      return;
    }
  }
  yield { type: "done" };
}
