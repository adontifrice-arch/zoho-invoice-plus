import { useMemo, useState } from "react";
import type { Customer, MailContact } from "../shared/types";
import { api } from "./api";
import { useApp } from "./store";

type Choice = { key: string; label: string; email: string; group: "client" | "generic" };

export function SendMailDialog({
  title,
  subjectPreview,
  path,
  customer,
  genericContacts,
  onClose,
  onSent,
}: {
  title: string;
  subjectPreview: string;
  path: string;
  customer: Customer;
  genericContacts: MailContact[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { state, notify } = useApp();
  const configured = state?.mail?.configured === true;
  const contacts = customer.contacts?.length
    ? customer.contacts
    : customer.email
      ? [{ id: "legacy", name: customer.name, email: customer.email, role: "", isPrimary: true }]
      : [];
  const choices = useMemo(() => {
    const rows: Choice[] = contacts
      .filter((entry) => entry.email)
      .map((entry) => ({
        key: `c:${entry.id}`,
        label: [entry.name || entry.email, entry.role].filter(Boolean).join(" · "),
        email: entry.email.toLowerCase(),
        group: "client",
      }));
    for (const entry of genericContacts) {
      if (!entry.email) continue;
      rows.push({
        key: `g:${entry.id}`,
        label: entry.name || entry.email,
        email: entry.email.toLowerCase(),
        group: "generic",
      });
    }
    return rows;
  }, [contacts, genericContacts]);

  const primaryEmail = (contacts.find((entry) => entry.isPrimary) ?? contacts[0])?.email?.toLowerCase() || "";
  const [toKeys, setToKeys] = useState<string[]>(() => {
    const primary = choices.find((entry) => entry.email === primaryEmail && entry.group === "client");
    return primary ? [primary.key] : choices[0] ? [choices[0].key] : [];
  });
  const [ccKeys, setCcKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(list: string[], key: string, on: boolean): string[] {
    if (on) return list.includes(key) ? list : [...list, key];
    return list.filter((entry) => entry !== key);
  }

  async function send() {
    if (!configured) {
      setError("La messagerie n'est pas configurée. Ajoutez les secrets SMTP dans GoDaddy.");
      return;
    }
    const to = choices.filter((entry) => toKeys.includes(entry.key)).map((entry) => entry.email);
    const cc = choices.filter((entry) => ccKeys.includes(entry.key) && !toKeys.includes(entry.key)).map((entry) => entry.email);
    if (to.length === 0) {
      setError("Choisissez au moins un destinataire.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(path, { method: "POST", body: JSON.stringify({ to, cc }) });
      notify("E-mail envoyé.");
      onSent();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mail-title" onClick={(event) => event.stopPropagation()} style={{ width: "min(640px, 100%)" }}>
        <h2 id="mail-title">{title}</h2>
        <p>Objet : {subjectPreview}</p>
        {!configured ? (
          <p className="form-error" role="alert">Messagerie non configurée. Renseignez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM dans les secrets GoDaddy.</p>
        ) : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {choices.length === 0 ? (
          <p className="hint">Ajoutez un contact e-mail sur la fiche client avant d'envoyer.</p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginBottom: 16 }}>
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <legend style={{ padding: "0 6px" }}>À</legend>
              {choices.filter((entry) => entry.group === "client").map((entry) => (
                <label key={entry.key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    checked={toKeys.includes(entry.key)}
                    onChange={(event) => {
                      setToKeys(toggle(toKeys, entry.key, event.target.checked));
                      if (event.target.checked) setCcKeys((current) => current.filter((key) => key !== entry.key));
                    }}
                  />
                  <span>{entry.label} <span className="hint">&lt;{entry.email}&gt;</span></span>
                </label>
              ))}
            </fieldset>
            <fieldset style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
              <legend style={{ padding: "0 6px" }}>Cc</legend>
              {choices.map((entry) => (
                <label key={`cc-${entry.key}`} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input
                    type="checkbox"
                    disabled={toKeys.includes(entry.key)}
                    checked={ccKeys.includes(entry.key) && !toKeys.includes(entry.key)}
                    onChange={(event) => setCcKeys(toggle(ccKeys, entry.key, event.target.checked))}
                  />
                  <span>
                    {entry.group === "generic" ? "Générique · " : ""}
                    {entry.label} <span className="hint">&lt;{entry.email}&gt;</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        )}
        <div className="actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" type="button" onClick={() => void send()} disabled={busy || !configured || choices.length === 0}>
            {busy ? "Envoi…" : "Envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
