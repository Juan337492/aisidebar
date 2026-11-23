import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useSettings, useTheme } from "@/lib/settings";
import { useProviders } from "@/lib/useProviders";
import { SettingsPanel } from "@/components/Settings";
import "@/assets/styles.css";

function Options() {
  const [settings, update] = useSettings();
  useTheme(settings?.theme);
  const state = useProviders(settings);
  if (!settings) return null;
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-8 pb-2">
        <img src="/icon/48.png" alt="" width={28} height={28} className="rounded-md" />
        <h1 className="text-lg font-semibold">AI Sidebar settings</h1>
      </header>
      <SettingsPanel settings={settings} update={update} state={state} />
    </div>
  );
}

// Reuse the root when dev hot-reload re-runs this module.
const container = document.getElementById("root") as HTMLElement & { _root?: ReturnType<typeof createRoot> };
container._root ??= createRoot(container);
container._root.render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
