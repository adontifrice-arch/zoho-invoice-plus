import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import type { PublicStore } from "../shared/types";

export type AppState = PublicStore & {
  today: string;
  createdId?: string;
  deleted?: boolean;
  archived?: boolean;
  mail?: { configured: boolean; from: string };
};

type StoreValue = {
  state: AppState | null;
  error: string | null;
  flash: string | null;
  reload: () => Promise<void>;
  mutate: (path: string, init?: RequestInit) => Promise<AppState>;
  notify: (message: string) => void;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const next = await api<AppState>("/api/state");
    setState(next);
    setError(null);
  }, []);

  useEffect(() => {
    reload().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Impossible de charger les données.");
    });
  }, [reload]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 3600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const mutate = useCallback(async (path: string, init?: RequestInit) => {
    const next = await api<AppState>(path, init);
    setState(next);
    setError(null);
    return next;
  }, []);

  const notify = useCallback((message: string) => setFlash(message), []);

  const value = useMemo(
    () => ({ state, error, flash, reload, mutate, notify }),
    [state, error, flash, reload, mutate, notify],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useApp(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Contexte manquant.");
  return value;
}
