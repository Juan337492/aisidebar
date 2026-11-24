import { useEffect, useState } from "react";
import { browser } from "wxt/browser";

export interface ProviderPrefs {
  enabled: boolean;
  displayName?: string;
}

export interface Selection {
  provider?: string;
  model?: string;
  effort?: string;
}

import { DEFAULT_ACTIONS, type QuickAction } from "./actions";

export { DEFAULT_ACTIONS, type QuickAction };

export interface Settings {
  companionUrl: string;
  token: string;
  providers: Record<string, ProviderPrefs>;
  selection: Selection;
  theme: "system" | "light" | "dark";
  /** Custom instructions added to every new conversation. */
  instructions: string;
  actions: QuickAction[];
  /** Release version the user chose to stop hearing about. */
  dismissedUpdate?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  companionUrl: "http://127.0.0.1:8765",
  token: "",
  providers: {},
  selection: {},
  theme: "system",
  instructions: "",
  actions: DEFAULT_ACTIONS,
};

const KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const res = await browser.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(res[KEY] as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

export function isProviderEnabled(s: Settings, id: string): boolean {
  return s.providers[id]?.enabled ?? true;
}

/** Live settings: re-renders whenever any extension page changes them. */
export function useSettings(): [Settings | undefined, (patch: Partial<Settings>) => Promise<void>] {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    getSettings().then(setSettings);
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && KEY in changes) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings>) });
      }
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return [
    settings,
    async (patch) => {
      setSettings(await updateSettings(patch));
    },
  ];
}

/** Applies the theme to <html data-theme>. */
export function useTheme(theme: Settings["theme"] | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
}
