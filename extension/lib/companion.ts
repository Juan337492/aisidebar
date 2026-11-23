import type { ChatEvent, ChatRequest, ProviderStatus } from "./types";
import type { Settings } from "./settings";

export class CompanionError extends Error {
  constructor(
    message: string,
    public kind: "unreachable" | "unauthorized" | "other",
  ) {
    super(message);
  }
}

function base(s: Settings) {
  return s.companionUrl.replace(/\/+$/, "");
}

async function call(s: Settings, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(base(s) + path, {
      ...init,
      headers: { authorization: `Bearer ${s.token}`, "content-type": "application/json", ...init.headers },
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new CompanionError(
      `Can't reach the companion at ${base(s)}. Make sure it's installed and running.`,
      "unreachable",
    );
  }
  if (res.status === 401) throw new CompanionError("The pairing token is wrong. Copy it from the companion's output.", "unauthorized");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new CompanionError(body.error ?? `Companion error ${res.status}`, "other");
  }
  return res;
}

export async function getHealth(s: Settings): Promise<{ version: string }> {
  return (await call(s, "/health")).json();
}

export async function getProviders(s: Settings, refresh = false): Promise<ProviderStatus[]> {
  const res = await call(s, `/providers${refresh ? "?refresh=1" : ""}`);
  return (await res.json()).providers;
}

/** Streams NDJSON chat events from the companion. Abort `signal` to stop generation. */
export async function* streamChat(s: Settings, req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await call(s, "/chat", { method: "POST", body: JSON.stringify(req), signal });
  if (!res.body) throw new CompanionError("Empty response from companion", "other");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatEvent;
    }
  }
  if (buf.trim()) yield JSON.parse(buf) as ChatEvent;
}

/**
 * Asks the companion for its token. The companion shows an "Allow AI Sidebar?" dialog on the Mac,
 * so no token has to be copied by hand. Resolves with the token once the person clicks Allow.
 */
export async function pair(companionUrl: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(companionUrl.replace(/\/+$/, "") + "/pair", { method: "POST" });
  } catch {
    throw new CompanionError(
      `Can't reach the companion at ${companionUrl}. Make sure it's installed and running.`,
      "unreachable",
    );
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.token) throw new CompanionError(body.error ?? `Pairing failed (${res.status})`, "other");
  return body.token as string;
}

export async function startLogin(s: Settings, provider: string): Promise<void> {
  await call(s, `/providers/${encodeURIComponent(provider)}/login`, { method: "POST" });
}

export async function cancelLogin(s: Settings, provider: string): Promise<void> {
  await call(s, `/providers/${encodeURIComponent(provider)}/login/cancel`, { method: "POST" });
}

export async function logout(s: Settings, provider: string): Promise<void> {
  await call(s, `/providers/${encodeURIComponent(provider)}/logout`, { method: "POST" });
}
