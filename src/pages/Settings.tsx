import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { VAT_RATES } from "../../shared/types";
import type { MailContact, Settings } from "../../shared/types";
import { useApp } from "../store";
import { ConfirmDialog, Field, useTitle } from "../ui";

function blankMailContact(): MailContact {
  return { id: `mail_${Math.random().toString(36).slice(2, 10)}`, name: "", email: "" };
}

export function SettingsPage() {
  const { state, mutate, notify } = useApp();
  useTitle("Réglages");
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busyReset, setBusyReset] = useState(false);
  if (!state) return null;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Société</p>
          <h1>Réglages</h1>
          <p className="lede">Ces informations figurent sur les PDF.</p>
        </div>
      </header>
      <SettingsForm settings={state.settings} today={state.today} mailConfigured={state.mail?.configured === true} mailFrom={state.mail?.from || ""} />
      <section className="card" style={{ marginTop: 16 }}>
        <h2>Données de démonstration</h2>
        <p className="hint" style={{ marginTop: 8 }}>
          Remplace les clients, articles, devis, factures, avoirs, paiements, taxes et devises par le jeu d'exemple. La connexion Zoho est conservée. Les fiches importées sont retirées.
        </p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-danger" type="button" onClick={() => setConfirm(true)}>Réinitialiser les données</button>
        </div>
      </section>
      {confirm ? (
        <ConfirmDialog
          title="Revenir aux données de démonstration ?"
          body="Les clients, pièces et fiches importées seront remplacés par l'exemple. La connexion Zoho, s'il y en a une, reste en place."
          confirmLabel="Réinitialiser"
          danger
          busy={busyReset}
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setBusyReset(true);
            try {
              await mutate("/api/demo/reset", { method: "POST" });
              notify("Données de démonstration rechargées.");
              navigate("/");
            } finally {
              setBusyReset(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function SettingsForm({
  settings,
  today,
  mailConfigured,
  mailFrom,
}: {
  settings: Settings;
  today: string;
  mailConfigured: boolean;
  mailFrom: string;
}) {
  const { mutate, notify } = useApp();
  const [form, setForm] = useState({ ...settings, mailContacts: settings.mailContacts ?? [] });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof Settings) => (event: { target: { value: string } }) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: key === "paymentTermDays" || key === "quoteValidityDays" || key === "defaultVatBps" ? Number(value) : value }));
  };

  function updateMailContact(id: string, patch: Partial<MailContact>) {
    setForm((current) => ({
      ...current,
      mailContacts: current.mailContacts.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mutate("/api/settings", {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          mailContacts: form.mailContacts.filter((entry) => entry.email.trim()),
        }),
      });
      notify("Réglages enregistrés.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const year = today.slice(0, 4);
  const preview = (prefix: string, next: number) => `${prefix}-${year}-${String(next).padStart(3, "0")}`;

  return (
    <form className="card" onSubmit={submit}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-grid">
        <Field label="Raison sociale"><input value={form.companyName} onChange={set("companyName")} /></Field>
        <Field label="Forme juridique"><input value={form.legalForm} onChange={set("legalForm")} /></Field>
        <Field label="Activité" className="span-2"><input value={form.tagline} onChange={set("tagline")} /></Field>
        <Field label="Adresse" className="span-2"><input value={form.address} onChange={set("address")} /></Field>
        <Field label="Code postal"><input value={form.postalCode} onChange={set("postalCode")} /></Field>
        <Field label="Ville"><input value={form.city} onChange={set("city")} /></Field>
        <Field label="Pays"><input value={form.country} onChange={set("country")} /></Field>
        <Field label="E-mail"><input value={form.email} onChange={set("email")} /></Field>
        <Field label="Téléphone"><input value={form.phone} onChange={set("phone")} /></Field>
        <Field label="Site web"><input value={form.website} onChange={set("website")} /></Field>
        <Field label="SIRET"><input value={form.siret} onChange={set("siret")} /></Field>
        <Field label="Numéro de TVA"><input value={form.vatNumber} onChange={set("vatNumber")} /></Field>
        <Field label="RCS"><input value={form.rcs} onChange={set("rcs")} /></Field>
        <Field label="Capital"><input value={form.capital} onChange={set("capital")} /></Field>
        <Field label="IBAN"><input value={form.iban} onChange={set("iban")} /></Field>
        <Field label="BIC"><input value={form.bic} onChange={set("bic")} /></Field>
        <Field label="TVA par défaut">
          <select value={form.defaultVatBps} onChange={set("defaultVatBps")}>
            {VAT_RATES.map((rate) => <option key={rate.bps} value={rate.bps}>{rate.label}</option>)}
          </select>
        </Field>
        <Field label="Délai de paiement (jours)"><input type="number" min={0} max={365} value={form.paymentTermDays} onChange={set("paymentTermDays")} /></Field>
        <Field label="Validité des devis (jours)"><input type="number" min={1} max={365} value={form.quoteValidityDays} onChange={set("quoteValidityDays")} /></Field>
        <Field label="Préfixe factures"><input value={form.invoicePrefix} onChange={set("invoicePrefix")} /></Field>
        <Field label="Préfixe devis"><input value={form.quotePrefix} onChange={set("quotePrefix")} /></Field>
        <Field label="Préfixe avoirs"><input value={form.creditPrefix} onChange={set("creditPrefix")} /></Field>
        <Field label="Préfixe paiements"><input value={form.paymentPrefix} onChange={set("paymentPrefix")} /></Field>
      </div>
      <p className="hint" style={{ marginTop: 14 }}>
        Prochains numéros : {preview(form.invoicePrefix, settings.nextInvoice)}, {preview(form.quotePrefix, settings.nextQuote)}, {preview(form.creditPrefix, settings.nextCredit)}, {preview(form.paymentPrefix, settings.nextPayment)}.
        Le numéro d'une facture est attribué à l'émission. Supprimer un brouillon ne crée pas de trou.
      </p>

      <div style={{ marginTop: 22 }}>
        <div className="section-title">
          <h2>Messagerie</h2>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {mailConfigured
            ? `Messagerie configurée. Expéditeur : ${mailFrom || "défini dans les secrets GoDaddy"}.`
            : "Messagerie non configurée. Ajoutez SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et MAIL_FROM dans les secrets GoDaddy (Preview et Publish), puis redémarrez l'application."}
        </p>
      </div>

      <div style={{ marginTop: 18 }}>
        <div className="section-title">
          <h2>Contacts génériques (Cc)</h2>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => setForm((current) => ({ ...current, mailContacts: [...current.mailContacts, blankMailContact()] }))}
          >
            Ajouter
          </button>
        </div>
        <p className="hint" style={{ marginTop: 6 }}>Ces adresses sont proposées en copie lors de l'envoi d'une facture ou d'un relevé.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {form.mailContacts.length === 0 ? <p className="empty">Aucun contact générique.</p> : null}
          {form.mailContacts.map((contact) => (
            <div key={contact.id} className="form-grid" style={{ padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
              <Field label="Nom"><input value={contact.name} onChange={(event) => updateMailContact(contact.id, { name: event.target.value })} /></Field>
              <Field label="E-mail"><input type="email" value={contact.email} onChange={(event) => updateMailContact(contact.id, { email: event.target.value })} /></Field>
              <div style={{ display: "flex", alignItems: "end" }}>
                <button
                  className="btn btn-danger btn-small"
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, mailContacts: current.mailContacts.filter((entry) => entry.id !== contact.id) }))}
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
