import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, ChatEvent, ChatRequest, ModelOption, ProviderStatus } from "../types.ts";
import { parseJson, run, streamLines, which } from "../process.ts";

const EFFORT_ORDER = ["low", "medium", "high", "xhigh"];

/** Antigravity's CLI as installed by T3 Code, if it isn't on PATH. */
function t3Binary(): string | undefined {
  try {
    const dir = join(homedir(), ".t3", "tools", "antigravity-acp", `${process.platform}-${process.arch}`);
    const { releaseId } = JSON.parse(readFileSync(join(dir, "active.json"), "utf8"));
    const bin = join(dir, "versions", releaseId, "antigravity");
    readFileSync(join(dir, "versions", releaseId, ".install-complete.json"));
    return bin;
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
  const binary = () => getBinaryOverride() ?? which("antigravity") ?? which("agy") ?? t3Binary();

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
      };
      if (!bin) {
        return (cached = {
          at: Date.now(),
          value: {
            ...base,
            message: "Antigravity CLI not found. Install Antigravity (or enable it in T3 Code), or set its path in ~/.aisidebar/config.json.",
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
            : (models.stderr || models.stdout).trim().slice(0, 300) || "Not signed in. Run `antigravity` in a terminal and sign in with Google.",
      };
      cached = { at: Date.now(), value };
      return value;
    },

    async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
      const bin = binary();
      if (!bin) throw new Error("Antigravity CLI not found.");
      // No system-prompt flag, so instructions ride along with the first turn.
      const prompt = req.system && !req.sessionId ? `${req.system}\n\n${req.prompt}` : req.prompt;
      const args = ["-p", prompt, "--output-format", "stream-json", "--disable-slash-commands", "--sandbox"];
      if (req.model) args.push("--model", req.effort ? `${req.model}-${req.effort}` : req.model);
      if (req.sessionId) args.push("--conversation", req.sessionId);

      let sentSession = false;
      for await (const line of streamLines(bin, args, signal)) {
        const ev = parseJson(line);
        if (!ev) continue;
        const convId = ev.conversation_id ?? ev.step_update?.conversation_id ?? ev.result?.conversation_id;
        if (!sentSession && typeof convId === "string") {
          sentSession = true;
          yield { type: "session", id: convId };
        }
        if (ev.event === "step_update") {
          const s = ev.step_update ?? {};
          if (s.step_type === "agent_response") {
            if (s.thinking_delta) yield { type: "thinking", delta: s.thinking_delta };
            if (s.text_delta) yield { type: "text", delta: s.text_delta };
          } else if (s.state === "ACTIVE" && s.step_type && s.step_type !== "user_input") {
            yield { type: "status", text: String(s.step_type).replace(/_/g, " ") };
          }
        } else if (ev.event === "result") {
          const r = ev.result ?? {};
          if (r.status && r.status !== "SUCCESS") {
            yield { type: "error", message: String(r.error ?? r.response ?? `Antigravity: ${r.status}`) };
          } else {
            yield { type: "done", usage: r.usage };
          }
          return;
        } else if (ev.event === "error") {
          yield { type: "error", message: String(ev.error?.message ?? ev.message ?? "Antigravity error") };
          return;
        }
      }
      yield { type: "done" };
    },
  };
}
