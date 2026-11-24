// Shared wire types between the companion and the extension.
// extension/lib/types.ts must stay identical (a test checks this).

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
  /** Where to get the CLI if it's missing. */
  installUrl?: string;
  /** Label for the sign-in button, e.g. "Sign in with Google". Absent = sign-in not supported. */
  signInLabel?: string;
  canSignOut?: boolean;
  /** Present while a sign-in started from the sidebar is running or just failed. */
  login?: LoginState;
  /** Whether this provider's models can look at images (screenshots). */
  images?: boolean;
}

export interface LoginState {
  state: "pending" | "failed";
  /** Official sign-in page, in case the browser didn't open by itself. */
  url?: string;
  message?: string;
  startedAt: number;
}

export interface ChatRequest {
  provider: string;
  prompt: string;
  model?: string;
  effort?: string;
  /** Provider-side session/conversation id to continue. */
  sessionId?: string;
  /** Extra instructions from the user's settings. */
  system?: string;
  /** Screenshots or pasted images for this turn (base64, no data: prefix). */
  images?: ChatImage[];
}

export interface ChatImage {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  data: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

/** What /update reports: whether a newer release exists on GitHub. */
export interface UpdateInfo {
  current: string;
  latest?: string;
  updateAvailable: boolean;
  /** True when the companion can update itself (installed with npm, not run from source). */
  canSelfUpdate: boolean;
  releaseUrl: string;
  /** Set while a self-update started from the sidebar is running or just failed. */
  updating?: "running" | "failed";
  message?: string;
}

export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "status"; text: string }
  | { type: "done"; usage?: Usage }
  | { type: "error"; message: string };

/** A running sign-in. The CLI opens the provider's official page; we only watch for it to finish. */
export interface LoginProcess {
  /** Resolves when sign-in succeeds; rejects with a readable message when it fails. */
  done: Promise<void>;
  /** Called with the sign-in URL if the CLI prints one. */
  onUrl(cb: (url: string) => void): void;
  cancel(): void;
}

export interface Adapter {
  id: string;
  displayName: string;
  status(force?: boolean): Promise<ProviderStatus>;
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
  login?(): LoginProcess;
  logout?(): Promise<void>;
}
