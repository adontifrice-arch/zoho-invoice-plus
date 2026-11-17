import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { centsToInput, customerTitle, formatDate, parseMoneyToCents } from "../../shared/format";
import { invoiceStatusLabel, paymentMethodLabel } from "../../shared/labels";
import { addDays, defaultInvoiceTerms, documentTotals, invoiceBalance, invoiceViewStatus } from "../../shared/money";
import { PAYMENT_METHODS } from "../../shared/types";
import type { InvoiceViewStatus, PaymentMethod } from "../../shared/types";
import { DocumentForm } from "../document-form";
import type { DocumentBody } from "../document-form";
import { lineToDraft, readLines } from "../lines";
import type { DraftLine } from "../lines";
import { LineEditor } from "../lines";
import { useApp } from "../store";
import { SendMailDialog } from "../mail-dialog";
import { ConfirmDialog, Field, InvoiceBadge, Missing, Money, useTitle } from "../ui";
import { LinesTable, Totals } from "./Quotes";

const FILTERS: { id: "all" | InvoiceViewStatus; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "draft", label: "Brouillons" },
  { id: "issued", label: "Émises" },
  { id: "partial", label: "Partielles" },
  { id: "overdue", label: "En retard" },
  { id: "paid", label: "Payées" },
  { id: "void", label: "Annulées" },
];

export function InvoiceList() {
  const { state } = useApp();
  const navigate = useNavigate();
  useTitle("Factures");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  if (!state) return null;
  const needle = query.trim().toLowerCase();
  const rows = [...state.invoices]
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
    .filter((invoice) => {
      const balance = invoiceBalance(invoice, state.creditNotes, state.payments);
      const status = invoiceViewStatus(invoice, balance, state.today);
      if (filter !== "all" && status !== filter) return false;
      const customer = state.customers.find((entry) => entry.id === invoice.customerId);
      const hay = `${invoice.number} ${customer ? customerTitle(customer) : ""}`.toLowerCase();
      return !needle || hay.includes(needle);
    });

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Vente</p>
          <h1>Factures</h1>
          <p className="lede">Le numéro définitif est donné à l'émission.</p>
        </div>
        <Link className="btn btn-primary" to="/factures/nouvelle">Nouvelle facture</Link>
      </header>
      <div className="toolbar">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro ou client" aria-label="Rechercher une facture" />
        <div className="chips">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" className={filter === entry.id ? "chip is-on" : "chip"} onClick={() => setFilter(entry.id)}>{entry.label}</button>
          ))}
        </div>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucune facture ne correspond.</p> : (
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Date</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th className="right">Reste</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const customer = state.customers.find((entry) => entry.id === invoice.customerId);
                const balance = invoiceBalance(invoice, state.creditNotes, state.payments);
                return (
                  <tr key={invoice.id} className="clickable" onClick={() => navigate(`/factures/${invoice.id}`)}>
                    <td><Link className="num" to={`/factures/${invoice.id}`}>{invoice.number || "Brouillon"}</Link></td>
                    <td>{customer ? customerTitle(customer) : "—"}</td>
                    <td>{formatDate(invoice.issueDate)}</td>
                    <td>{formatDate(invoice.dueDate)}</td>
                    <td><InvoiceBadge state={state} invoice={invoice} /></td>
                    <td className="right">{invoice.status === "issued" ? <Money cents={balance.due} currency={invoice.currencyCode} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

export function InvoiceEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const invoice = state?.invoices.find((entry) => entry.id === id);
  useTitle(invoice ? "Modifier la facture" : "Nouvelle facture");
  if (!state) return null;
  if (id && !invoice) return <Missing title="Facture introuvable" to="/factures" label="Retour aux factures" />;
  if (invoice && invoice.status !== "draft") {
    return <Missing title="Seule une facture brouillon se modifie" to={`/factures/${invoice.id}`} label="Voir la facture" />;
  }
  const preset = params.get("client") ?? "";
  const initialCustomer = invoice?.customerId || (state.customers.some((customer) => customer.id === preset && !customer.archived) ? preset : "");

  async function save(body: DocumentBody) {
    if (invoice) {
      await mutate(`/api/invoices/${invoice.id}`, { method: "PUT", body: JSON.stringify(body) });
      notify("Facture enregistrée.");
      navigate(`/factures/${invoice.id}`);
      return;
    }
    const result = await mutate("/api/invoices", { method: "POST", body: JSON.stringify(body) });
    notify("Facture brouillon créée.");
    navigate(`/factures/${result.createdId}`);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to={invoice ? `/factures/${invoice.id}` : "/factures"}>← Factures</Link>
          <h1>{invoice ? "Modifier le brouillon" : "Nouvelle facture"}</h1>
        </div>
      </header>
      <DocumentForm
        kind="invoice"
        customers={state.customers}
        items={state.items}
        settings={state.settings}
        cancelTo={invoice ? `/factures/${invoice.id}` : "/factures"}
        submitLabel={invoice ? "Enregistrer" : "Créer le brouillon"}
        initial={{
          customerId: initialCustomer,
          issueDate: invoice?.issueDate ?? state.today,
          secondDate: invoice?.dueDate ?? addDays(state.today, state.settings.paymentTermDays),
          notes: invoice?.notes ?? "",
          terms: invoice?.terms ?? defaultInvoiceTerms(state.settings.paymentTermDays),
          lines: invoice?.lines ?? [],
        }}
        onSubmit={save}
      />
    </>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const invoice = state?.invoices.find((entry) => entry.id === id);
  useTitle(invoice?.number || "Facture");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [confirm, setConfirm] = useState<null | "issue" | "void" | "delete">(null);
  if (!state) return null;
  if (!invoice) return <Missing title="Facture introuvable" to="/factures" label="Retour aux factures" />;

  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  const quote = state.quotes.find((entry) => entry.id === invoice.quoteId);
  const balance = invoiceBalance(invoice, state.creditNotes, state.payments);
  const status = invoiceViewStatus(invoice, balance, state.today);
  const payments = state.payments.filter((payment) => payment.invoiceId === invoice.id);
  const credits = state.creditNotes.filter((note) => note.invoiceId === invoice.id);
  const creditable = documentTotals(invoice.lines).ttc - balance.credited;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirm(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action impossible.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to="/factures">← Factures</Link>
          <h1>{invoice.number || "Brouillon"}</h1>
          <p className="lede">
            <InvoiceBadge state={state} invoice={invoice} />
            {customer ? <Link to={`/clients/${customer.id}`}> {customerTitle(customer)}</Link> : null}
          </p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">Voir le PDF</a>
          {invoice.status === "draft" ? <Link className="btn btn-ghost" to={`/factures/${invoice.id}/modifier`}>Modifier</Link> : null}
          {invoice.status === "draft" ? (
            <button className="btn btn-primary" type="button" onClick={() => setConfirm("issue")}>Émettre la facture</button>
          ) : null}
          {invoice.status === "issued" ? (
            <button className="btn btn-ghost" type="button" onClick={() => setMailing(true)}>Envoyer par e-mail</button>
          ) : null}
          {invoice.status === "issued" && balance.due > 0 ? (
            <button className="btn btn-primary" type="button" onClick={() => setPaying((value) => !value)}>Enregistrer un paiement</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="actions" style={{ marginBottom: 16 }}>
        {invoice.status === "issued" && creditable > 0 ? <Link className="btn btn-ghost btn-small" to={`/factures/${invoice.id}/avoir`}>Créer un avoir</Link> : null}
        <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(async () => {
          const result = await mutate(`/api/invoices/${invoice.id}/duplicate`, { method: "POST" });
          notify("Brouillon dupliqué.");
          navigate(`/factures/${result.createdId}`);
        })}>Dupliquer</button>
        {invoice.status === "issued" && payments.length === 0 && credits.length === 0 ? (
          <button className="btn btn-danger btn-small" type="button" onClick={() => setConfirm("void")}>Annuler la facture</button>
        ) : null}
        {invoice.status === "draft" ? <button className="btn btn-danger btn-small" type="button" onClick={() => setConfirm("delete")}>Supprimer</button> : null}
        {quote ? <Link className="btn btn-ghost btn-small" to={`/devis/${quote.id}`}>Devis {quote.number}</Link> : null}
      </div>

      {paying && invoice.status === "issued" ? (
        <PaymentForm
          invoiceId={invoice.id}
          due={balance.due}
          today={state.today}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            notify("Paiement enregistré.");
          }}
        />
      ) : null}

      <section className="card">
        <dl className="dl">
          <dt>Date</dt><dd>{formatDate(invoice.issueDate)}</dd>
          <dt>Échéance</dt><dd>{formatDate(invoice.dueDate)}</dd>
          <dt>Statut</dt><dd>{invoiceStatusLabel(status, balance.due)}</dd>
        </dl>
        <LinesTable lines={invoice.lines} currency={invoice.currencyCode} />
        <Totals
          currency={invoice.currencyCode}
          ht={balance.ht}
          vat={balance.vatBreakdown}
          ttc={balance.ttc}
          extra={invoice.status === "draft" ? undefined : [
            ...(balance.credited ? [{ label: "Avoirs", cents: -balance.credited }] : []),
            ...(balance.paid ? [{ label: "Réglé", cents: -balance.paid }] : []),
            { label: balance.due < 0 ? "À rembourser" : "Reste à payer", cents: balance.due, strong: true, className: balance.due > 0 ? "debt" : "credit" },
          ]}
        />
        {invoice.notes ? <p style={{ marginTop: 16 }}>{invoice.notes}</p> : null}
        {invoice.terms ? <p className="hint" style={{ marginTop: 8 }}>{invoice.terms}</p> : null}
      </section>

      <div className="split" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Paiements</h2>
          {payments.length === 0 ? <p className="empty">Aucun paiement.</p> : payments.map((payment) => (
            <div className="pay-row" key={payment.id}>
              <div>
                <strong>{payment.number}</strong>
                <span className="customer-sub">{formatDate(payment.date)} · {paymentMethodLabel(payment.method)}{payment.reference ? ` · ${payment.reference}` : ""}</span>
              </div>
              <div className="actions">
                <Money cents={payment.amountCents} currency={payment.currencyCode} />
                <button className="btn btn-danger btn-small" type="button" onClick={() => run(async () => {
                  await mutate(`/api/payments/${payment.id}`, { method: "DELETE" });
                  notify("Paiement supprimé.");
                })}>Retirer</button>
              </div>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>Avoirs</h2>
          {credits.length === 0 ? <p className="empty">Aucun avoir.</p> : credits.map((note) => (
            <Link className="list-link" key={note.id} to={`/avoirs/${note.id}`}>
              <strong>{note.number}</strong>
              <span className="list-meta"><Money cents={documentTotals(note.lines).ttc} currency={invoice.currencyCode} /></span>
              <small>{formatDate(note.issueDate)}{note.reason ? ` · ${note.reason}` : ""}</small>
            </Link>
          ))}
        </section>
      </div>

      {confirm ? (
        <ConfirmDialog
          title={confirm === "issue" ? "Émettre cette facture ?" : confirm === "void" ? "Annuler cette facture ?" : "Supprimer ce brouillon ?"}
          body={
            confirm === "issue"
              ? "Un numéro définitif lui est attribué s'il n'en a pas déjà un. Elle ne sera plus modifiable. Vous pourrez ensuite l'envoyer par e-mail."
              : confirm === "void"
                ? "Le numéro est conservé. La facture reste visible comme annulée."
                : "Le brouillon sera effacé. Aucun numéro de facture n'a été consommé."
          }
          confirmLabel={confirm === "issue" ? "Émettre" : confirm === "void" ? "Annuler la facture" : "Supprimer"}
          danger={confirm !== "issue"}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => run(async () => {
            if (confirm === "issue") {
              await mutate(`/api/invoices/${invoice.id}/issue`, { method: "POST" });
              notify("Facture émise.");
            } else if (confirm === "void") {
              await mutate(`/api/invoices/${invoice.id}/void`, { method: "POST" });
              notify("Facture annulée.");
            } else {
              await mutate(`/api/invoices/${invoice.id}`, { method: "DELETE" });
              notify("Brouillon supprimé.");
              navigate("/factures");
            }
          })}
        />
      ) : null}
      {mailing && customer ? (
        <SendMailDialog
          title={`Envoyer la facture ${invoice.number}`}
          subjectPreview={`Facture ${invoice.number} — ${state.settings.companyName}`}
          path={`/api/invoices/${invoice.id}/email`}
          customer={customer}
          genericContacts={state.settings.mailContacts ?? []}
          onClose={() => setMailing(false)}
          onSent={() => setMailing(false)}
        />
      ) : null}
    </>
  );
}

function PaymentForm({
  invoiceId,
  due,
  today,
  onClose,
  onSaved,
}: {
  invoiceId: string;
  due: number;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mutate } = useApp();
  const [amount, setAmount] = useState(centsToInput(due));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyToCents(amount);
    if (amountCents == null || amountCents <= 0) {
      setError("Indiquez un montant.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amountCents, date, method, reference, notes }),
      });
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Paiement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
      <div className="section-title">
        <h2>Paiement</h2>
        <span>Reste à payer {centsToInput(due)} €</span>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Montant TTC"><input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Mode">
          <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </Field>
        <Field label="Référence"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
        <Field label="Note" className="span-2"><input value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le paiement"}</button>
        <button className="btn btn-ghost" type="button" onClick={onClose}>Fermer</button>
      </div>
    </form>
  );
}

export function CreditNoteForm() {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const invoice = state?.invoices.find((entry) => entry.id === id);
  useTitle("Nouvel avoir");
  const [lines, setLines] = useState<DraftLine[] | null>(null);
  const [date, setDate] = useState(state?.today ?? "");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const draft = useMemo(() => {
    if (lines) return lines;
    return invoice ? invoice.lines.map(lineToDraft) : [];
  }, [lines, invoice]);

  if (!state) return null;
  if (!invoice) return <Missing title="Facture introuvable" to="/factures" label="Retour aux factures" />;
  if (invoice.status !== "issued") return <Missing title="Un avoir se crée sur une facture émise" to={`/factures/${invoice.id}`} label="Voir la facture" />;

  const balance = invoiceBalance(invoice, state.creditNotes, state.payments);
  const creditable = balance.ttc - balance.credited;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = readLines(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await mutate(`/api/invoices/${invoice!.id}/credit-notes`, {
        method: "POST",
        body: JSON.stringify({ issueDate: date, reason, notes, lines: parsed.lines }),
      });
      notify("Avoir créé.");
      navigate(`/avoirs/${result.createdId}`);
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to={`/factures/${invoice.id}`}>← {invoice.number}</Link>
          <h1>Nouvel avoir</h1>
          <p className="lede">Maximum imputable sur cette facture : {centsToInput(creditable)} €.</p>
        </div>
      </header>
      <form onSubmit={submit} className="stack">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <section className="card">
          <div className="form-grid">
            <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
            <Field label="Motif"><input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          </div>
        </section>
        <section className="card">
          <LineEditor items={state.items} lines={draft} onChange={setLines} defaultVat={state.settings.defaultVatBps} />
        </section>
        <section className="card">
          <Field label="Note"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Créer l'avoir"}</button>
            <Link className="btn btn-ghost" to={`/factures/${invoice.id}`}>Annuler</Link>
          </div>
        </section>
      </form>
    </>
  );
}
