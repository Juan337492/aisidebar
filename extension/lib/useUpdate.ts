import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { getHealth, getUpdate, startUpdate } from "./companion";
import type { Settings } from "./settings";
import type { UpdateInfo } from "./types";

/** Is `a` a newer version than `b`? ("0.10.0" > "0.9.1") */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
}

export interface UpdateState {
  info?: UpdateInfo;
  /** A newer extension than this one has been released. */
  extensionOutdated: boolean;
  extensionVersion: string;
  updating: boolean;
  error?: string;
  update: () => Promise<void>;
  check: () => Promise<void>;
}

/** Checks (through the companion) whether a newer release is out, and runs one-click companion updates. */
export function useUpdate(settings: Settings | undefined, connected: boolean): UpdateState {
  const [info, setInfo] = useState<UpdateInfo>();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string>();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const extensionVersion = browser.runtime.getManifest().version;

  const check = useCallback(async () => {
    if (!settingsRef.current) return;
    try {
      setInfo(await getUpdate(settingsRef.current));
    } catch {
      setInfo(undefined); // older companions have no /update
    }
  }, []);

  useEffect(() => {
    if (connected) check();
  }, [connected, check]);

  const update = useCallback(async () => {
    const s = settingsRef.current;
    if (!s) return;
    setUpdating(true);
    setError(undefined);
    const before = info?.current;
    try {
      await startUpdate(s);
      // The companion restarts with the new version; wait for it to come back.
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const h = await getHealth(s).catch(() => undefined);
        if (h && h.version !== before) break;
        const u = await getUpdate(s).catch(() => undefined);
        if (u?.updating === "failed") throw new Error(u.message ?? "The update failed.");
      }
      await check();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(false);
    }
  }, [info?.current, check]);

  return {
    info,
    extensionOutdated: !!info?.latest && isNewer(info.latest, extensionVersion),
    extensionVersion,
    updating,
    error,
    update,
    check,
  };
}
