import type { Adapter, ChatEvent, ChatRequest, ModelOption, ProviderStatus } from "../types.ts";
import { parseJson, run, streamLines, watchLogin, which } from "../process.ts";
import { normalizeUsage, systemPrompt, validImages } from "../prompt.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

// Claude Code accepts these aliases and resolves them to the newest model of each tier.
const MODELS: ModelOption[] = [
  { id: "opus", name: "Claude Opus", efforts: EFFORTS, defaultEffort: "medium" },
  { id: "sonnet", name: "Claude Sonnet", efforts: EFFORTS, defaultEffort: "medium" },
  { id: "haiku", name: "Claude Haiku", efforts: EFFORTS, defaultEffort: "low" },
];

const PLAN_LABELS: Record<string, string> = {
  pro: "Claude Pro subscription",
  max: "Claude Max subscription",
  team: "Claude Team",
  enterprise: "Claude Enterprise",
};

/** Uses the locally installed Claude Code CLI, signed in with your claude.ai subscription. */
export function claudeAdapter(getBinaryOverride: () => string | undefined): Adapter {
  let cached: { at: number; value: ProviderStatus } | undefined;
  const binary = () => getBinaryOverride() ?? which("claude");

  return {
    id: "claude",
    displayName: "Claude",

    async status(force = false) {
      if (!force && cached && Date.now() - cached.at < 60_000) return cached.value;
      const bin = binary();
      const base: ProviderStatus = {
        id: "claude",
        displayName: "Claude",
        kind: "Claude subscription via Claude Code",
        installed: false,
        authenticated: false,
        models: MODELS,
        installUrl: "https://claude.com/product/claude-code",
        signInLabel: "Sign in with Claude",
        canSignOut: true,
        images: true,
      };
      if (!bin) {
        return (cached = {
          at: Date.now(),
          value: { ...base, message: "Claude Code isn't installed. Install it from claude.com/code, then run `claude` once to sign in." },
        }).value;
      }
      const [ver, auth] = await Promise.all([run(bin, ["--version"]), run(bin, ["auth", "status"])]);
      const info = parseJson(auth.stdout) ?? {};
      const plan = String(info.subscriptionType ?? info.planTier ?? "");
      const value: ProviderStatus = {
        ...base,
        installed: true,
        binary: bin,
        version: ver.stdout.trim().split(/\s+/)[0] || undefined,
        authenticated: Boolean(info.loggedIn),
        account:
          info.authMethod === "claude.ai"
            ? PLAN_LABELS[plan] ?? "Claude subscription"
            : info.loggedIn
              ? "API key / Console"
              : undefined,
        message: info.loggedIn ? undefined : "Not signed in. Click Sign in to log in with your Claude account.",
      };
      cached = { at: Date.now(), value };
      return value;
    },

    login() {
      const bin = binary();
      if (!bin) throw new Error("Claude Code isn't installed.");
      cached = undefined;
      // Opens claude.ai's own sign-in page in the browser and waits for it to finish.
      return watchLogin(bin, ["auth", "login", "--claudeai"]);
    },

    async logout() {
      const bin = binary();
      if (!bin) throw new Error("Claude Code isn't installed.");
      cached = undefined;
      const r = await run(bin, ["auth", "logout"]);
      if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || "Sign-out failed.");
    },

    async *chat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
      const bin = binary();
      if (!bin) throw new Error("Claude Code isn't installed.");
      // The message goes in on stdin as stream-json (see streamLines): page text of any size works on every OS,
      // and screenshots can ride along as image blocks.
      const args = [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
        // Plain chat: no file/shell tools, no MCP servers, no project settings or hooks.
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--disable-slash-commands",
      ];
      if (req.model) args.push("--model", req.model);
      if (req.effort) args.push("--effort", req.effort);
      // Replace Claude Code's coding-agent prompt with a plain chat prompt (sent every turn).
      args.push("--system-prompt", systemPrompt(req));
      if (req.sessionId) args.push("--resume", req.sessionId);
      const content = [
        ...validImages(req.images).map((img) => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.data },
        })),
        { type: "text", text: req.prompt },
      ];
      const input = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n";

      let sentSession = false;
      for await (const line of streamLines(bin, args, signal, input)) {
        const ev = parseJson(line);
        if (!ev) continue;
        if (!sentSession && typeof ev.session_id === "string") {
          sentSession = true;
          yield { type: "session", id: ev.session_id };
        }
        if (ev.type === "stream_event" && ev.event?.type === "content_block_delta") {
          const d = ev.event.delta;
          if (d?.type === "text_delta" && d.text) yield { type: "text", delta: d.text };
          else if (d?.type === "thinking_delta" && d.thinking) yield { type: "thinking", delta: d.thinking };
        } else if (ev.type === "result") {
          if (ev.is_error || (ev.subtype && ev.subtype !== "success")) {
            yield { type: "error", message: String(ev.result ?? ev.error ?? ev.subtype ?? "Claude returned an error") };
          } else {
            yield { type: "done", usage: normalizeUsage(ev.usage) };
          }
          return;
        }
      }
      yield { type: "done" };
    },
  };
}
