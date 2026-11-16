import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customerTitle, formatDate } from "../../shared/format";
import { documentTotals } from "../../shared/money";
import { useApp } from "../store";
import { ConfirmDialog, Missing, Money, useTitle } from "../ui";
import { LinesTable, Totals } from "./Quotes";

export function CreditNoteList() {
  const { state } = useApp();
  const navigate = useNavigate();
  useTitle("Avoirs");
  if (!state) return null;
  const rows = [...state.creditNotes].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Vente</p>
          <h1>Avoirs</h1>
          <p className="lede">Un avoir diminue le reste à payer d'une facture émise.</p>
        </div>
      </header>
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucun avoir. Ouvrez une facture émise pour en créer un.</p> : (
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Facture</th>
                <th>Date</th>
                <th>Motif</th>
                <th className="right">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((note) => {
                const customer = state.customers.find((entry) => entry.id === note.customerId);
                const invoice = state.invoices.find((entry) => entry.id === note.invoiceId);
                return (
                  <tr key={note.id} className="clickable" onClick={() => navigate(`/avoirs/${note.id}`)}>
                    <td><Link className="num" to={`/avoirs/${note.id}`}>{note.number}</Link></td>
                    <td>{customer ? customerTitle(customer) : "—"}</td>
                    <td>{invoice?.number || "—"}</td>
                    <td>{formatDate(note.issueDate)}</td>
                    <td>{note.reason || "—"}</td>
                    <td className="right"><Money cents={documentTotals(note.lines).ttc} currency={invoice?.currencyCode} /></td>
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

export function CreditNoteDetail() {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const note = state?.creditNotes.find((entry) => entry.id === id);
  useTitle(note?.number || "Avoir");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;
  if (!note) return <Missing title="Avoir introuvable" to="/avoirs" label="Retour aux avoirs" />;
  const customer = state.customers.find((entry) => entry.id === note.customerId);
  const invoice = state.invoices.find((entry) => entry.id === note.invoiceId);
  const totals = documentTotals(note.lines);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/credit-notes/${note!.id}`, { method: "DELETE" });
      notify("Avoir supprimé.");
      navigate(invoice ? `/factures/${invoice.id}` : "/avoirs");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to="/avoirs">← Avoirs</Link>
          <h1>{note.number}</h1>
          <p className="lede">
            {customer ? <Link to={`/clients/${customer.id}`}>{customerTitle(customer)}</Link> : "Client"}
            {invoice ? <> · <Link to={`/factures/${invoice.id}`}>{invoice.number}</Link></> : null}
          </p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={`/api/credit-notes/${note.id}/pdf`} target="_blank" rel="noreferrer">Voir le PDF</a>
          <button className="btn btn-danger" type="button" onClick={() => setConfirm(true)}>Supprimer</button>
        </div>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <section className="card">
        <dl className="dl">
          <dt>Date</dt><dd>{formatDate(note.issueDate)}</dd>
          <dt>Motif</dt><dd>{note.reason || "—"}</dd>
        </dl>
        <LinesTable lines={note.lines} currency={invoice?.currencyCode} />
        <Totals currency={invoice?.currencyCode} ht={totals.ht} vat={totals.vatBreakdown} ttc={totals.ttc} />
        {note.notes ? <p style={{ marginTop: 16 }}>{note.notes}</p> : null}
      </section>
      {confirm ? (
        <ConfirmDialog
          title="Supprimer cet avoir ?"
          body="Le reste à payer de la facture sera recalculé."
          confirmLabel="Supprimer"
          danger
          busy={busy}
          onClose={() => setConfirm(false)}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}
