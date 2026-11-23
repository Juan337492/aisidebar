import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { cancelLogin, logout, startLogin } from "@/lib/companion";
import type { Settings } from "@/lib/settings";
import type { ProviderStatus } from "@/lib/types";

const btn = "rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";
export const primaryBtn = `${btn} bg-accent text-accent-fg`;
export const secondaryBtn = `${btn} border border-line hover:bg-elevated`;

/**
 * Sign-in controls for one provider. Signing in opens the provider's own page (claude.ai or
 * Google) in the browser — the extension never sees a password.
 */
export function ProviderAuth({
  p,
  settings,
  refresh,
  showSignOut = false,
}: {
  p: ProviderStatus;
  settings: Settings;
  refresh: (force?: boolean) => Promise<void>;
  showSignOut?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      await refresh(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const signIn = () => act(() => startLogin(settings, p.id));
  const errorLine = error && <p className="text-xs text-danger">{error}</p>;

  if (!p.installed) {
    return (
      <div className="space-y-1">
        <a href={p.installUrl} target="_blank" rel="noreferrer" className={`${secondaryBtn} inline-flex items-center gap-1.5`}>
          Install {p.displayName} <ExternalLink size={12} />
        </a>
        <p className="text-xs text-muted">After installing, click refresh above.</p>
      </div>
    );
  }

  if (p.login?.state === "pending") {
    return (
      <div className="space-y-2 rounded-lg bg-elevated p-3 text-xs">
        <p className="flex items-center gap-2 font-medium">
          <Loader2 size={13} className="animate-spin" /> Finish signing in on the page that just opened
        </p>
        <p className="text-muted">
          Use your usual {p.id === "claude" ? "Claude" : "Google"} account there (email, password, code or SSO). This updates
          automatically when you're done.
        </p>
        <div className="flex flex-wrap gap-2">
          {p.login.url && (
            <a href={p.login.url} target="_blank" rel="noreferrer" className={`${secondaryBtn} inline-flex items-center gap-1.5`}>
              Didn't open? Open sign-in page <ExternalLink size={12} />
            </a>
          )}
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => act(() => cancelLogin(settings, p.id))}>
            Cancel
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (!p.authenticated) {
    return (
      <div className="space-y-1.5">
        {p.login?.state === "failed" && <p className="text-xs text-danger">Sign-in didn't finish: {p.login.message}</p>}
        {p.signInLabel && (
          <button type="button" className={primaryBtn} disabled={busy} onClick={signIn}>
            {p.login?.state === "failed" ? "Try again" : p.signInLabel}
          </button>
        )}
        {errorLine}
      </div>
    );
  }

  if (!showSignOut || !p.canSignOut) return null;
  const confirmText =
    `Sign out of ${p.displayName} on this computer?\n\n` +
    `This also signs out ${p.id === "claude" ? "Claude Code" : "Antigravity"} everywhere else on this Mac (terminal, T3 Code, etc.).`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondaryBtn}
          disabled={busy}
          onClick={() => confirm(confirmText) && act(async () => { await logout(settings, p.id); await startLogin(settings, p.id); })}
        >
          Change account
        </button>
        <button
          type="button"
          className={`${secondaryBtn} text-danger`}
          disabled={busy}
          onClick={() => confirm(confirmText) && act(() => logout(settings, p.id))}
        >
          Sign out
        </button>
      </div>
      {errorLine}
    </div>
  );
}
