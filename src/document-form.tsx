import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { customerTitle, formatMoney } from "../shared/format";
import { vatLabel } from "../shared/money";
import type { Customer, Item, Line, LineInput, Settings } from "../shared/types";
import { LineEditor, blankLine, lineToDraft, previewTotals, readLines } from "./lines";
import type { DraftLine } from "./lines";
import { Field } from "./ui";

export type DocumentBody = {
  customerId: string;
  issueDate: string;
  validUntil?: string;
  dueDate?: string;
  notes: string;
  terms: string;
  lines: LineInput[];
};

export function DocumentForm({
  kind,
  customers,
  items,
  settings,
  initial,
  submitLabel,
  cancelTo,
  onSubmit,
}: {
  kind: "quote" | "invoice";
  customers: Customer[];
  items: Item[];
  settings: Settings;
  initial: {
    customerId: string;
    issueDate: string;
    secondDate: string;
    notes: string;
    terms: string;
    lines: Line[];
  };
  submitLabel: string;
  cancelTo: string;
  onSubmit: (body: DocumentBody) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId);
  const [issueDate, setIssueDate] = useState(initial.issueDate);
  const [secondDate, setSecondDate] = useState(initial.secondDate);
  const [notes, setNotes] = useState(initial.notes);
  const [terms, setTerms] = useState(initial.terms);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines.length ? initial.lines.map(lineToDraft) : [blankLine(settings.defaultVatBps)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => previewTotals(lines), [lines]);
  const choices = customers.filter((customer) => !customer.archived || customer.id === customerId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!customerId) {
      setError("Choisissez un client.");
      return;
    }
    if (!issueDate || !secondDate) {
      setError("Indiquez les dates.");
      return;
    }
    const parsed = readLines(lines);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        customerId,
        issueDate,
        notes,
        terms,
        lines: parsed.lines,
        ...(kind === "quote" ? { validUntil: secondDate } : { dueDate: secondDate }),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="editor" onSubmit={submit}>
      <div className="stack">
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <section className="card">
          <div className="form-grid">
            <Field label="Client" className="span-2">
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Choisir un client</option>
                {choices.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customerTitle(customer)}</option>
                ))}
              </select>
            </Field>
            {choices.length === 0 ? (
              <p className="hint span-2">
                Aucun client actif. <Link to="/clients/nouveau">Créer un client</Link>
              </p>
            ) : null}
            <Field label="Date">
              <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            </Field>
            <Field label={kind === "quote" ? "Valable jusqu'au" : "Échéance"}>
              <input type="date" value={secondDate} onChange={(event) => setSecondDate(event.target.value)} />
            </Field>
          </div>
        </section>
        <section className="card">
          <div className="section-title">
            <h2>Lignes</h2>
            <span>Montants hors taxes</span>
          </div>
          <LineEditor items={items} lines={lines} onChange={setLines} defaultVat={settings.defaultVatBps} />
        </section>
        <section className="card">
          <div className="form-grid">
            <Field label="Note" className="span-2">
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Field label="Conditions" className="span-2">
              <textarea value={terms} onChange={(event) => setTerms(event.target.value)} />
            </Field>
          </div>
        </section>
      </div>
      <aside className="editor-side">
        <section className="card">
          <h2>Totaux</h2>
          <div className="totals" style={{ width: "100%", marginTop: 12 }}>
            <div className="total-row"><span>Total HT</span><span className="money">{formatMoney(preview.totals.ht)}</span></div>
            {preview.totals.vatBreakdown.map((entry) => (
              <div className="total-row" key={entry.bps}>
                <span>TVA {vatLabel(entry.bps)}</span>
                <span className="money">{formatMoney(entry.vat)}</span>
              </div>
            ))}
            <div className="total-row strong"><span>Total TTC</span><span className="money">{formatMoney(preview.totals.ttc)}</span></div>
          </div>
          {preview.incomplete ? <p className="hint" style={{ marginTop: 8 }}>Complétez les lignes pour un total définitif.</p> : null}
          <div className="actions" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : submitLabel}</button>
            <Link className="btn btn-ghost" to={cancelTo}>Annuler</Link>
          </div>
        </section>
      </aside>
    </form>
  );
}
