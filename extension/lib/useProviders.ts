import { useCallback, useEffect, useState } from "react";
import { CompanionError, getProviders } from "./companion";
import { isProviderEnabled, type Settings } from "./settings";
import type { ModelOption, ProviderStatus } from "./types";
import type { Target } from "./useChat";

export interface ProvidersState {
  providers: ProviderStatus[];
  error?: CompanionError;
  loading: boolean;
  checkedAt?: number;
  refresh: (force?: boolean) => Promise<void>;
}

export function useProviders(settings: Settings | undefined): ProvidersState {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState<CompanionError>();
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number>();
  const url = settings?.companionUrl;
  const token = settings?.token;

  const refresh = useCallback(
    async (force = false) => {
      if (!settings) return;
      setLoading(true);
      try {
        setProviders(await getProviders(settings, force));
        setError(undefined);
      } catch (e) {
        setProviders([]);
        setError(e instanceof CompanionError ? e : new CompanionError(String(e), "other"));
      } finally {
        setLoading(false);
        setCheckedAt(Date.now());
      }
    },
    // Only the connection details matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, token],
  );

  useEffect(() => {
    if (url !== undefined) refresh();
  }, [refresh, url]);

  return { providers, error, loading, checkedAt, refresh };
}

/** Providers you can chat with right now. */
export function usableProviders(settings: Settings, providers: ProviderStatus[]) {
  return providers.filter((p) => p.installed && p.authenticated && p.models.length && isProviderEnabled(settings, p.id));
}

export function providerName(settings: Settings, p: ProviderStatus) {
  return settings.providers[p.id]?.displayName || p.displayName;
}

/** Resolves the saved selection against what's actually available, falling back to sensible defaults. */
export function resolveTarget(
  settings: Settings,
  providers: ProviderStatus[],
): (Target & { modelInfo?: ModelOption }) | undefined {
  const usable = usableProviders(settings, providers);
  if (!usable.length) return undefined;
  const sel = settings.selection;
  const p = usable.find((x) => x.id === sel.provider) ?? usable[0];
  const m = p && (p.models.find((x) => x.id === sel.model) ?? p.models[0]);
  if (!p || !m) return undefined;
  const effort = m.efforts.length
    ? m.efforts.includes(sel.effort ?? "")
      ? sel.effort
      : (m.defaultEffort ?? m.efforts[0])
    : undefined;
  return { provider: p.id, model: m.id, effort, modelInfo: m };
}
