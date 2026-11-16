import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { centsToInput, customerTitle, formatDate, parseMoneyToCents } from "../../shared/format";
import { paymentMethodLabel } from "../../shared/labels";
import { invoiceBalance } from "../../shared/money";
import { PAYMENT_METHODS } from "../../shared/types";
import type { PaymentMethod } from "../../shared/types";
import { useApp } from "../store";
import { ConfirmDialog, Field, Money, useTitle } from "../ui";

export function PaymentList() {
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  useTitle("Paiements");
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!state) return null;

  const rows = [...state.payments].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const openInvoices = state.invoices.filter((invoice) => {
    if (invoice.status !== "issued") return false;
    return invoiceBalance(invoice, state.creditNotes, state.payments).due > 0;
  });

  async function remove(id: string) {
    setBusy(true);
    try {
      await mutate(`/api/payments/${id}`, { method: "DELETE" });
      notify("Paiement supprimé.");
      setConfirmId(null);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Trésorerie</p>
          <h1>Paiements</h1>
          <p className="lede">Chaque paiement est rattaché à une facture émise.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setOpen((value) => !value)} disabled={openInvoices.length === 0}>
          Enregistrer un paiement
        </button>
      </header>
      {open ? <QuickPayment invoices={openInvoices} today={state.today} customers={state.customers} onDone={() => { setOpen(false); notify("Paiement enregistré."); }} /> : null}
      {openInvoices.length === 0 ? <p className="hint" style={{ marginBottom: 12 }}>Aucune facture n'a de reste à payer.</p> : null}
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucun paiement.</p> : (
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Client</th>
                <th>Facture</th>
                <th>Mode</th>
                <th className="right">Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => {
                const customer = state.customers.find((entry) => entry.id === payment.customerId);
                const invoice = state.invoices.find((entry) => entry.id === payment.invoiceId);
                return (
                  <tr key={payment.id} className="clickable" onClick={() => invoice && navigate(`/factures/${invoice.id}`)}>
                    <td className="num">{payment.number}</td>
                    <td>{formatDate(payment.date)}</td>
                    <td>{customer ? customerTitle(customer) : "—"}</td>
                    <td>{invoice ? <Link to={`/factures/${invoice.id}`}>{invoice.number || "Brouillon"}</Link> : "—"}</td>
                    <td>{paymentMethodLabel(payment.method)}{payment.reference ? <span className="customer-sub">{payment.reference}</span> : null}</td>
                    <td className="right"><Money cents={payment.amountCents} currency={payment.currencyCode} /></td>
                    <td className="right">
                      <button className="btn btn-danger btn-small" type="button" onClick={(event) => { event.stopPropagation(); setConfirmId(payment.id); }}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {confirmId ? (
        <ConfirmDialog
          title="Supprimer ce paiement ?"
          body="Le reste à payer de la facture sera recalculé."
          confirmLabel="Supprimer"
          danger
          busy={busy}
          onClose={() => setConfirmId(null)}
          onConfirm={() => remove(confirmId)}
        />
      ) : null}
    </>
  );
}

function QuickPayment({
  invoices,
  customers,
  today,
  onDone,
}: {
  invoices: { id: string; number: string; customerId: string }[];
  customers: { id: string; company: string; name: string }[];
  today: string;
  onDone: () => void;
}) {
  const { state, mutate } = useApp();
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? "");
  const invoice = state?.invoices.find((entry) => entry.id === invoiceId);
  const due = state && invoice ? invoiceBalance(invoice, state.creditNotes, state.payments).due : 0;
  const [amount, setAmount] = useState(due > 0 ? centsToInput(due) : "");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function choose(id: string) {
    setInvoiceId(id);
    const next = state?.invoices.find((entry) => entry.id === id);
    if (state && next) setAmount(centsToInput(invoiceBalance(next, state.creditNotes, state.payments).due));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountCents = parseMoneyToCents(amount);
    if (!invoiceId || amountCents == null || amountCents <= 0) {
      setError("Choisissez une facture et un montant.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amountCents, date, method, reference }),
      });
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Paiement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 16 }}>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-grid">
        <Field label="Facture" className="span-2">
          <select value={invoiceId} onChange={(event) => choose(event.target.value)}>
            {invoices.map((entry) => {
              const customer = customers.find((item) => item.id === entry.customerId);
              return (
                <option key={entry.id} value={entry.id}>
                  {entry.number} — {customer ? customerTitle(customer) : "Client"}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="Montant TTC"><input value={amount} inputMode="decimal" onChange={(event) => setAmount(event.target.value)} /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Mode">
          <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </Field>
        <Field label="Référence"><input value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </form>
  );
}
