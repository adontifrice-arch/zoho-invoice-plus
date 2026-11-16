import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { formatMoney } from "../shared/format";
import { invoiceStatusLabel, QUOTE_STATUS_LABEL } from "../shared/labels";
import { invoiceBalance, invoiceViewStatus, quoteExpired } from "../shared/money";
import type { Invoice, Quote } from "../shared/types";
import { useAccount } from "./auth";
import { useApp } from "./store";
import type { AppState } from "./store";

const NAV = [
  { to: "/", label: "Tableau de bord", icon: "home", end: true },
  { to: "/clients", label: "Clients", icon: "users" },
  { to: "/articles", label: "Articles", icon: "tag" },
  { to: "/devis", label: "Devis", icon: "file" },
  { to: "/factures", label: "Factures", icon: "invoice" },
  { to: "/avoirs", label: "Avoirs", icon: "credit" },
  { to: "/paiements", label: "Paiements", icon: "coin" },
  { to: "/import-zoho", label: "Import Zoho", icon: "cloud" },
  { to: "/reglages", label: "Réglages", icon: "sliders" },
] as const;

export function Shell() {
  const { state, error, flash, reload } = useApp();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (!state && error) {
    return (
      <div className="boot-error">
        <h1>Les données ne répondent pas</h1>
        <p>{error}</p>
        <button className="btn btn-primary" type="button" onClick={() => reload().catch(() => undefined)}>
          Réessayer
        </button>
      </div>
    );
  }
  if (!state) return <div className="loading">Chargement du registre…</div>;

  const initial = state.settings.companyName.trim().charAt(0).toUpperCase() || "L";
  return (
    <div className="app">
      {open ? <button className="scrim" type="button" aria-label="Fermer le menu" onClick={() => setOpen(false)} /> : null}
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="mark">{initial}</span>
          <span>
            <strong>{state.settings.companyName}</strong>
            <small>Facturation</small>
          </span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>{account}</p>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => {
              fetch("/api/auth/logout", { method: "POST" }).finally(() => {
                window.location.assign("/");
              });
            }}
          >
            Se déconnecter
          </button>
        </div>
      </aside>
      <div className="main">
        <div className="mobile-bar">
          <button className="btn btn-ghost btn-small" type="button" onClick={() => setOpen(true)}>
            Menu
          </button>
          <strong>{state.settings.companyName}</strong>
        </div>
        <div className="content">
          <div className="page">
            <Outlet />
          </div>
        </div>
      </div>
      {flash ? <div className="toast" role="status">{flash}</div> : null}
    </div>
  );
}

export function useTitle(title: string) {
  const { state } = useApp();
  useEffect(() => {
    document.title = state ? `${title} — ${state.settings.companyName}` : title;
  }, [title, state]);
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={className ? `field ${className}` : "field"}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Money({ cents, currency = "EUR", strong = false }: { cents: number; currency?: string; strong?: boolean }) {
  return <span className={strong ? "money money-strong" : "money"}>{formatMoney(cents, currency)}</span>;
}

export function InvoiceBadge({ state, invoice }: { state: AppState; invoice: Invoice }) {
  const balance = invoiceBalance(invoice, state.creditNotes, state.payments);
  const status = invoiceViewStatus(invoice, balance, state.today);
  return <span className={`badge badge-${status}`}>{invoiceStatusLabel(status, balance.due)}</span>;
}

export function QuoteBadge({ state, quote }: { state: AppState; quote: Quote }) {
  return (
    <span className="badges">
      <span className={`badge badge-${quote.status}`}>{QUOTE_STATUS_LABEL[quote.status]}</span>
      {quoteExpired(quote, state.today) ? <span className="badge badge-overdue">Expiré</span> : null}
    </span>
  );
}

export function Missing({ title, to, label }: { title: string; to: string; label: string }) {
  return (
    <div className="empty">
      <h1>{title}</h1>
      <Link className="btn btn-primary" to={to}>{label}</Link>
    </div>
  );
}

export function NotFound() {
  useTitle("Page introuvable");
  return (
    <div className="empty">
      <h1>Cette page n'existe pas</h1>
      <Link className="btn btn-primary" to="/">Retour au tableau de bord</Link>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(event) => event.stopPropagation()}>
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Annuler</button>
          <button className={danger ? "btn btn-danger" : "btn btn-primary"} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Patientez…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Icon({ name }: { name: (typeof NAV)[number]["icon"] }) {
  const props = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true };
  switch (name) {
    case "home":
      return <svg {...props}><path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
    case "users":
      return <svg {...props}><path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" /><circle cx="10" cy="8" r="3" /><path d="M20 20v-1.1A3.4 3.4 0 0 0 17.2 16" /><circle cx="17" cy="8.5" r="2.4" /></svg>;
    case "tag":
      return <svg {...props}><path d="M20 13.5 11.5 22 3 13.5V4h9.5z" /><circle cx="8" cy="8.5" r="1" /></svg>;
    case "file":
      return <svg {...props}><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v6h6M8 13h8M8 17h6" /></svg>;
    case "invoice":
      return <svg {...props}><path d="M7 3h10a1 1 0 0 1 1 1v17l-2.2-1.4L13.5 21 11 19.6 8.2 21 6 19.6V4a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6" /></svg>;
    case "credit":
      return <svg {...props}><path d="M4 7h16v10H4z" /><path d="M4 11h16M8 15h3" /></svg>;
    case "coin":
      return <svg {...props}><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /></svg>;
    case "sliders":
      return <svg {...props}><path d="M4 8h16M4 16h16" /><circle cx="9" cy="8" r="2" /><circle cx="15" cy="16" r="2" /></svg>;
    case "cloud":
      return <svg {...props}><path d="M7 18h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.6A3.5 3.5 0 0 0 7 18z" /><path d="M12 11v5M9.8 14.2 12 16.4l2.2-2.2" /></svg>;
  }
}
