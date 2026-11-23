import { useState } from "react";
import { pair } from "./companion";
import type { Settings } from "./settings";

/** One-click pairing: the companion asks for approval on the Mac and hands back its token. */
export function usePairing(settings: Settings, update: (p: Partial<Settings>) => Promise<void>, refresh: (force?: boolean) => Promise<void>) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string>();
  const connect = async (url = settings.companionUrl) => {
    setWaiting(true);
    setError(undefined);
    try {
      const token = await pair(url);
      await update({ companionUrl: url, token });
      await refresh(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWaiting(false);
    }
  };
  return { connect, waiting, error };
}
