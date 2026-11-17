import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Mark } from "./mark";

type Account = { email: string | null; configured: boolean };

const AccountContext = createContext<string | null>(null);

export function useAccount(): string | null {
  return useContext(AccountContext);
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((response) => response.json() as Promise<Account>)
      .then((next) => {
        if (!cancelled) setAccount(next);
      })
      .catch(() => {
        if (!cancelled) setAccount({ email: null, configured: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return <div className="loading">Chargement…</div>;
  if (!account.email) return <Login configured={account.configured} />;
  return <AccountContext.Provider value={account.email}>{children}</AccountContext.Provider>;
}

function Login({ configured }: { configured: boolean }) {
  const reason = new URLSearchParams(window.location.search).get("refuse");
  const message =
    reason === "compte"
      ? "Ce compte Google n'est pas autorisé."
      : reason === "google"
        ? "La connexion Google a échoué. Réessayez."
        : reason === "config" || !configured
          ? "La connexion Google n'est pas encore configurée sur le serveur."
          : "";
  return (
    <main className="login">
      <section className="login-card">
        <div className="login-brand">
          <Mark size={42} />
          <strong>OFF<i>the</i>GRID</strong>
        </div>
        <h1>Facturation</h1>
        <p>Les pièces restent au nom d'Off The Grid. Connectez-vous avec un compte Google autorisé.</p>
        {message ? <p className="form-error" role="alert">{message}</p> : null}
        {configured ? (
          <a className="btn btn-primary" href="/api/auth/google">Continuer avec Google</a>
        ) : null}
      </section>
    </main>
  );
}
