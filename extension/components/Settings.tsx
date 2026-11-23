import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { getHealth } from "@/lib/companion";
import { deleteAllChats } from "@/lib/chats";
import { isProviderEnabled, type Settings as S } from "@/lib/settings";
import type { ProvidersState } from "@/lib/useProviders";
import type { ProviderStatus } from "@/lib/types";
import { EFFORT_LABELS, ProviderMark, StatusDot, Toggle, timeAgo } from "./ui";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 outline-none focus:border-muted placeholder:text-muted";

function Companion({ settings, update, state }: { settings: S; update: (p: Partial<S>) => void; state: ProvidersState }) {
  const [url, setUrl] = useState(settings.companionUrl);
  const [token, setToken] = useState(settings.token);
  const [version, setVersion] = useState<string>();
  useEffect(() => setUrl(settings.companionUrl), [settings.companionUrl]);
  useEffect(() => setToken(settings.token), [settings.token]);
  useEffect(() => {
    getHealth(settings).then((h) => setVersion(h.version), () => setVersion(undefined));
  }, [settings.companionUrl, state.checkedAt]);

  const tone = state.error ? (state.error.kind === "unauthorized" ? "warn" : "bad") : version ? "ok" : "idle";
  const label = state.error
    ? state.error.kind === "unauthorized"
      ? "Reachable, but the token is wrong"
      : "Not reachable"
    : version
      ? `Connected · v${version}`
      : "Checking…";

  return (
    <Section title="Companion">
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs leading-relaxed text-muted">
          The companion is a small app on your computer. It runs Claude Code and Antigravity for the sidebar, so chats use
          your subscriptions instead of API keys. Start it with <code className="rounded bg-elevated px-1">npm run companion</code>{" "}
          in the <code className="rounded bg-elevated px-1">aisidebar</code> folder, then paste the URL and token it prints.
        </p>
        <div className="flex items-center gap-2 text-xs">
          <StatusDot tone={tone} />
          <span>{label}</span>
        </div>
        {state.error && <p className="text-xs text-danger">{state.error.message}</p>}
        <Field label="URL">
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} />
        </Field>
        <Field label="Pairing token">
          <input
            className={inputCls}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste the token from the companion"
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
        <button
          type="button"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-50"
          onClick={async () => {
            await update({ companionUrl: url.trim(), token: token.trim() });
            state.refresh(true);
          }}
        >
          Save and connect
        </button>
      </div>
    </Section>
  );
}

function ProviderRow({
  p,
  settings,
  update,
  selected,
  onSelect,
}: {
  p: ProviderStatus;
  settings: S;
  update: (patch: Partial<S>) => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const enabled = isProviderEnabled(settings, p.id);
  const prefs = settings.providers[p.id] ?? { enabled: true };
  const setPrefs = (patch: Partial<typeof prefs>) =>
    update({ providers: { ...settings.providers, [p.id]: { ...prefs, ...patch } } });
  const ready = p.installed && p.authenticated;
  const statusText = !p.installed ? "Not installed" : !p.authenticated ? "Not signed in" : `Authenticated · ${p.account ?? ""}`;

  return (
    <li className={`rounded-xl border bg-surface ${selected ? "border-accent" : "border-line"}`}>
      <div className="flex items-center gap-3 p-3">
        <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={selected}>
          <ProviderMark id={p.id} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="truncate font-medium">{prefs.displayName || p.displayName}</span>
              {p.version && <span className="font-mono text-[11px] text-muted">v{p.version}</span>}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <StatusDot tone={!enabled ? "idle" : ready ? "ok" : "warn"} />
              <span className="truncate">{enabled ? statusText : "Disabled"}</span>
            </span>
          </span>
          <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${selected ? "rotate-180" : ""}`} />
        </button>
        <Toggle label={`Enable ${p.displayName}`} checked={enabled} onChange={(v) => setPrefs({ enabled: v })} />
      </div>
      {selected && (
        <div className="space-y-3 border-t border-line p-3 text-xs">
          {p.message && <p className="text-warn">{p.message}</p>}
          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted">Sign-in method</dt>
            <dd>{p.kind}</dd>
            <dt className="text-muted">Account</dt>
            <dd>{p.account ?? "—"}</dd>
            <dt className="text-muted">CLI</dt>
            <dd className="font-mono break-all">{p.binary ?? "not found"}</dd>
          </dl>
          <Field label="Display name">
            <input
              className={inputCls}
              defaultValue={prefs.displayName ?? ""}
              placeholder={p.displayName}
              onBlur={(e) => setPrefs({ displayName: e.target.value.trim() || undefined })}
            />
          </Field>
          {p.models.length > 0 && (
            <div>
              <span className="mb-1 block font-medium text-muted">Models</span>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {p.models.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate">{m.name}</span>
                    <span className="shrink-0 text-muted">{m.efforts.map((e) => EFFORT_LABELS[e] ?? e).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function SettingsPanel({
  settings,
  update,
  state,
}: {
  settings: S;
  update: (p: Partial<S>) => Promise<void>;
  state: ProvidersState;
}) {
  const [open, setOpen] = useState<string>();
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5">
      <Companion settings={settings} update={update} state={state} />

      <Section
        title="Providers"
        action={
          <button
            type="button"
            onClick={() => state.refresh(true)}
            className="flex items-center gap-1.5 text-xs text-muted hover:text-fg"
            disabled={state.loading}
          >
            <RefreshCw size={12} className={state.loading ? "animate-spin" : ""} />
            {state.checkedAt ? `Checked ${timeAgo(state.checkedAt)}` : "Check"}
          </button>
        }
      >
        {state.providers.length ? (
          <ul className="space-y-2">
            {state.providers.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                settings={settings}
                update={update}
                selected={open === p.id}
                onSelect={() => setOpen(open === p.id ? undefined : p.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">Connect the companion to see your providers.</p>
        )}
      </Section>

      <Section title="Chat">
        <div className="space-y-4">
          <Field label="Custom instructions" hint="Added to every conversation, e.g. “Answer briefly. I'm a developer.”">
            <textarea
              className={`${inputCls} min-h-20 resize-y`}
              defaultValue={settings.instructions}
              onBlur={(e) => update({ instructions: e.target.value })}
            />
          </Field>
          <Field label="Theme">
            <select
              className={inputCls}
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as S["theme"] })}
            >
              <option value="system">Match system</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <button
            type="button"
            className="text-xs text-danger hover:underline"
            onClick={() => confirm("Delete all chats? This can't be undone.") && deleteAllChats()}
          >
            Delete all chats
          </button>
        </div>
      </Section>
    </div>
  );
}
