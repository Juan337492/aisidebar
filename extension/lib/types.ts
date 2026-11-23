// Shared wire types between the companion and the extension.
// Copied from companion/src/types.ts — keep in sync.

export interface ModelOption {
  id: string;
  name: string;
  /** Effort/thinking levels this model accepts. Empty = no effort control. */
  efforts: string[];
  defaultEffort?: string;
}

export interface ProviderStatus {
  id: string;
  displayName: string;
  /** How this provider signs in, e.g. "Claude subscription". */
  kind: string;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  /** Account label, e.g. "Claude Pro subscription" or "Google account". */
  account?: string;
  binary?: string;
  models: ModelOption[];
  /** Human-readable reason when not ready. */
  message?: string;
}

export interface ChatRequest {
  provider: string;
  prompt: string;
  model?: string;
  effort?: string;
  /** Provider-side session/conversation id to continue. */
  sessionId?: string;
  /** Extra instructions sent with the first turn. */
  system?: string;
}

export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "status"; text: string }
  | { type: "done"; usage?: Record<string, unknown> }
  | { type: "error"; message: string };

export interface Adapter {
  id: string;
  displayName: string;
  status(force?: boolean): Promise<ProviderStatus>;
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
