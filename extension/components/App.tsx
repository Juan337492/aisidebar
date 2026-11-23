import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { ArrowLeft, History as HistoryIcon, Settings as SettingsIcon, SquarePen } from "lucide-react";
import { useSettings, useTheme } from "@/lib/settings";
import { useChat } from "@/lib/useChat";
import { resolveTarget, useProviders } from "@/lib/useProviders";
import { loadChat, useChatList } from "@/lib/chats";
import { PENDING_KEY, takePending } from "@/lib/pending";
import { Composer, type Injection } from "./Composer";
import { MessageView } from "./MessageView";
import { ModelPicker } from "./ModelPicker";
import { History } from "./History";
import { SettingsPanel } from "./Settings";
import { IconButton, ProviderMark, timeAgo } from "./ui";
import { ProviderAuth, primaryBtn, secondaryBtn } from "./ProviderAuth";
import { usePairing } from "@/lib/usePairing";
import { ALLOW_BUTTON, CopyCommand, INSTALL_CMD, IS_WINDOWS, SETUP_URL, WINDOWS_SETUP_URL } from "./CopyCommand";
import { isProviderEnabled, type Settings } from "@/lib/settings";
import type { ProvidersState } from "@/lib/useProviders";

type View = "chat" | "history" | "settings";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function App() {
  const [settings, update] = useSettings();
  useTheme(settings?.theme);
  const providersState = useProviders(settings);
  const { providers, error } = providersState;
  const { chat, busy, status, send, stop, open, reset } = useChat();
  const [view, setView] = useState<View>("chat");
  const [inject, setInject] = useState<Injection>();
  const recents = useChatList().slice(0, 4);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const target = settings ? resolveTarget(settings, providers) : undefined;
  const modelName = (provider?: string, model?: string) =>
    providers.find((p) => p.id === provider)?.models.find((m) => m.id === model)?.name;

  // Keep the newest text in view while streaming, unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages]);

  // Right-click menu hand-off from the background script.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const targetRef = useRef(target);
  targetRef.current = target;
  useEffect(() => {
    const handle = async () => {
      const p = await takePending();
      if (!p) return;
      setView("chat");
      if (p.mode === "send" && p.text && settingsRef.current && targetRef.current) {
        reset();
        // let the reset render before sending
        setTimeout(() => send(settingsRef.current!, targetRef.current!, p.text!, p.attachments), 0);
      } else {
        setInject({ id: p.id, text: p.text, attachments: p.attachments });
      }
    };
    if (target) handle();
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && changes[PENDING_KEY]?.newValue) handle();
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, [!!target]);

  if (!settings) return null;

  const needsSetup = !!error || !target;
  const picker = <ModelPicker settings={settings} providers={providers} disabled={busy} onChange={(selection) => update({ selection })} />;

  const composer = (
    <Composer
      busy={busy}
      disabled={!target}
      inject={inject}
      picker={picker}
      onStop={stop}
      placeholder={chat.messages.length ? "Reply…" : undefined}
      onSend={(text, atts) => {
        if (!target) return;
        stickRef.current = true;
        send(settings, target, text, atts);
      }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 px-2 py-2">
        {view === "chat" ? (
          <IconButton label="Chats" onClick={() => setView("history")}>
            <HistoryIcon size={17} />
          </IconButton>
        ) : (
          <IconButton label="Back" onClick={() => setView("chat")}>
            <ArrowLeft size={17} />
          </IconButton>
        )}
        <h1 className="min-w-0 flex-1 truncate px-1 text-[13px] font-medium">
          {view === "history" ? "Chats" : view === "settings" ? "Settings" : chat.messages.length ? chat.title : ""}
        </h1>
        <IconButton
          label="New chat"
          onClick={() => {
            reset();
            setView("chat");
          }}
        >
          <SquarePen size={17} />
        </IconButton>
        <IconButton label="Settings" onClick={() => setView(view === "settings" ? "chat" : "settings")}>
          <SettingsIcon size={17} />
        </IconButton>
      </header>

      {view === "history" && (
        <div className="min-h-0 flex-1">
          <History
            activeId={chat.id}
            onOpen={async (id) => {
              const c = await loadChat(id);
              if (c) open(c);
              setView("chat");
            }}
          />
        </div>
      )}

      {view === "settings" && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SettingsPanel settings={settings} update={update} state={providersState} />
        </div>
      )}

      {view === "chat" && (
        <>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {chat.messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center px-5 py-8">
                <h2 className="mb-6 text-center font-serif text-[28px] font-normal tracking-tight">
                  <span className="mr-2 text-accent">✳</span>
                  {greeting()}
                </h2>
                {needsSetup && (
                  <SetupCard
                    settings={settings}
                    update={update}
                    state={providersState}
                    openSettings={() => setView("settings")}
                  />
                )}
                {recents.length > 0 && (
                  <div>
                    <h3 className="mb-1 px-1 text-xs text-muted">Recent chats</h3>
                    <ul>
                      {recents.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-elevated"
                            onClick={async () => {
                              const full = await loadChat(c.id);
                              if (full) open(full);
                            }}
                          >
                            <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            <span className="text-[11px] text-muted">{timeAgo(c.updatedAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-5 px-4 py-4">
                {chat.messages.map((m, i) => (
                  <MessageView
                    key={m.id}
                    m={m}
                    streaming={busy && i === chat.messages.length - 1}
                    status={status}
                    modelName={modelName(m.provider, m.model)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pt-1 pb-3">{composer}</div>
        </>
      )}
    </div>
  );
}

/** First-run card: connect the companion, then sign in to a provider — all without leaving the sidebar. */
function SetupCard({
  settings,
  update,
  state,
  openSettings,
}: {
  settings: Settings;
  update: (p: Partial<Settings>) => Promise<void>;
  state: ProvidersState;
  openSettings: () => void;
}) {
  const pairing = usePairing(settings, update, state.refresh);
  const { error, providers } = state;
  const card = "mb-6 space-y-3 rounded-xl border border-line bg-surface p-4 text-sm";

  if (error?.kind === "unreachable") {
    return (
      <div className={card}>
        <p className="font-medium">Install the companion</p>
        <p className="text-xs text-muted">
          AI Sidebar needs a small free app on your computer to reach your Claude and Google accounts.
          {IS_WINDOWS ? (
            <>
              {" "}
              <a href={WINDOWS_SETUP_URL} className="text-accent underline">
                Download the setup file
              </a>{" "}
              and double-click it, or paste this into PowerShell. Then click Try again:
            </>
          ) : (
            " Paste this into Terminal, then click Try again:"
          )}
        </p>
        <CopyCommand text={INSTALL_CMD} />
        <a href={SETUP_URL} target="_blank" rel="noreferrer" className="block text-xs text-accent underline">
          Setup guide
        </a>
        <button type="button" className={secondaryBtn} onClick={() => state.refresh(true)}>
          Try again
        </button>
      </div>
    );
  }

  if (error || !settings.token) {
    return (
      <div className={card}>
        <p className="font-medium">Connect to this computer</p>
        <p className="text-xs text-muted">
          {pairing.waiting
            ? `Look for the “AI Sidebar” popup on your computer and click ${ALLOW_BUTTON}.`
            : "AI Sidebar uses the companion app to reach your Claude and Google accounts."}
        </p>
        <button type="button" className={primaryBtn} disabled={pairing.waiting} onClick={() => pairing.connect()}>
          {pairing.waiting ? "Waiting for approval…" : "Connect"}
        </button>
        {pairing.error && <p className="text-xs text-danger">{pairing.error}</p>}
      </div>
    );
  }

  const enabled = providers.filter((p) => isProviderEnabled(settings, p.id));
  return (
    <div className={card}>
      <p className="font-medium">Sign in to get started</p>
      <p className="text-xs text-muted">Use your Claude or Google account. Sign-in happens on their official page.</p>
      <ul className="space-y-3">
        {enabled.map((p) => (
          <li key={p.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <ProviderMark id={p.id} size={16} />
              <span className="text-sm">{settings.providers[p.id]?.displayName || p.displayName}</span>
            </div>
            <ProviderAuth p={p} settings={settings} refresh={state.refresh} />
          </li>
        ))}
      </ul>
      {enabled.length === 0 && (
        <button type="button" className={secondaryBtn} onClick={openSettings}>
          Turn on a provider in Settings
        </button>
      )}
    </div>
  );
}
