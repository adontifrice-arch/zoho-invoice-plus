import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { customerTitle, formatDate, formatQty } from "../../shared/format";
import { QUOTE_STATUS_LABEL } from "../../shared/labels";
import { addDays, defaultQuoteTerms, documentTotals, lineAmounts, vatLabel } from "../../shared/money";
import type { QuoteStatus } from "../../shared/types";
import { DocumentForm } from "../document-form";
import type { DocumentBody } from "../document-form";
import { useApp } from "../store";
import { ConfirmDialog, Missing, Money, QuoteBadge, useTitle } from "../ui";

const FILTERS: { id: "all" | QuoteStatus; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "draft", label: "Brouillons" },
  { id: "sent", label: "Envoyés" },
  { id: "accepted", label: "Acceptés" },
  { id: "refused", label: "Refusés" },
  { id: "invoiced", label: "Facturés" },
];

export function QuoteList() {
  const { state } = useApp();
  const navigate = useNavigate();
  useTitle("Devis");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  if (!state) return null;
  const needle = query.trim().toLowerCase();
  const rows = [...state.quotes].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number)).filter((quote) => {
    if (filter !== "all" && quote.status !== filter) return false;
    const customer = state.customers.find((entry) => entry.id === quote.customerId);
    const hay = `${quote.number} ${customer ? customerTitle(customer) : ""}`.toLowerCase();
    return !needle || hay.includes(needle);
  });

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Vente</p>
          <h1>Devis</h1>
          <p className="lede">Un devis accepté se transforme en facture brouillon.</p>
        </div>
        <Link className="btn btn-primary" to="/devis/nouveau">Nouveau devis</Link>
      </header>
      <div className="toolbar">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Numéro ou client" aria-label="Rechercher un devis" />
        <div className="chips">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" className={filter === entry.id ? "chip is-on" : "chip"} onClick={() => setFilter(entry.id)}>{entry.label}</button>
          ))}
        </div>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucun devis ne correspond.</p> : (
          <table>
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Client</th>
                <th>Date</th>
                <th>Validité</th>
                <th>Statut</th>
                <th className="right">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((quote) => {
                const customer = state.customers.find((entry) => entry.id === quote.customerId);
                return (
                  <tr key={quote.id} className="clickable" onClick={() => navigate(`/devis/${quote.id}`)}>
                    <td><Link className="num" to={`/devis/${quote.id}`}>{quote.number}</Link></td>
                    <td>{customer ? customerTitle(customer) : "—"}</td>
                    <td>{formatDate(quote.issueDate)}</td>
                    <td>{formatDate(quote.validUntil)}</td>
                    <td><QuoteBadge state={state} quote={quote} /></td>
                    <td className="right"><Money cents={documentTotals(quote.lines).ttc} currency={quote.currencyCode} /></td>
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

export function QuoteEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const quote = state?.quotes.find((entry) => entry.id === id);
  useTitle(quote ? `Modifier ${quote.number}` : "Nouveau devis");
  if (!state) return null;
  if (id && !quote) return <Missing title="Devis introuvable" to="/devis" label="Retour aux devis" />;
  if (quote && !canEditQuote(state, quote)) {
    return <Missing title="Ce devis n'est plus modifiable" to={`/devis/${quote.id}`} label="Voir le devis" />;
  }
  const preset = params.get("client") ?? "";
  const initialCustomer = quote?.customerId || (state.customers.some((customer) => customer.id === preset && !customer.archived) ? preset : "");

  async function save(body: DocumentBody) {
    if (quote) {
      await mutate(`/api/quotes/${quote.id}`, { method: "PUT", body: JSON.stringify(body) });
      notify("Devis enregistré.");
      navigate(`/devis/${quote.id}`);
      return;
    }
    const result = await mutate("/api/quotes", { method: "POST", body: JSON.stringify(body) });
    notify("Devis créé.");
    navigate(`/devis/${result.createdId}`);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to={quote ? `/devis/${quote.id}` : "/devis"}>← Devis</Link>
          <h1>{quote ? quote.number : "Nouveau devis"}</h1>
        </div>
      </header>
      <DocumentForm
        kind="quote"
        customers={state.customers}
        items={state.items}
        settings={state.settings}
        cancelTo={quote ? `/devis/${quote.id}` : "/devis"}
        submitLabel={quote ? "Enregistrer" : "Créer le devis"}
        initial={{
          customerId: initialCustomer,
          issueDate: quote?.issueDate ?? state.today,
          secondDate: quote?.validUntil ?? addDays(state.today, state.settings.quoteValidityDays),
          notes: quote?.notes ?? "",
          terms: quote?.terms ?? defaultQuoteTerms(state.settings.quoteValidityDays),
          lines: quote?.lines ?? [],
        }}
        onSubmit={save}
      />
    </>
  );
}

function canEditQuote(state: NonNullable<ReturnType<typeof useApp>["state"]>, quote: { status: QuoteStatus; invoiceId: string | null }): boolean {
  if (quote.status === "invoiced" || quote.status === "refused") return false;
  if (!quote.invoiceId) return true;
  const invoice = state.invoices.find((entry) => entry.id === quote.invoiceId);
  return !invoice || invoice.status === "void";
}

export function QuoteDetail() {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const quote = state?.quotes.find((entry) => entry.id === id);
  useTitle(quote ? quote.number : "Devis");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const customer = state?.customers.find((entry) => entry.id === quote?.customerId);
  const invoice = state?.invoices.find((entry) => entry.id === quote?.invoiceId);
  const totals = useMemo(() => (quote ? documentTotals(quote.lines) : null), [quote]);
  if (!state) return null;
  if (!quote || !totals) return <Missing title="Devis introuvable" to="/devis" label="Retour aux devis" />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Action impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to="/devis">← Devis</Link>
          <h1>{quote.number}</h1>
          <p className="lede">
            <QuoteBadge state={state} quote={quote} />
            {customer ? <Link to={`/clients/${customer.id}`}> {customerTitle(customer)}</Link> : null}
          </p>
        </div>
        <div className="actions">
          <a className="btn btn-ghost" href={`/api/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer">Voir le PDF</a>
          {canEditQuote(state, quote) ? <Link className="btn btn-ghost" to={`/devis/${quote.id}/modifier`}>Modifier</Link> : null}
          {(quote.status === "sent" || quote.status === "accepted") && !invoice ? (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(async () => {
              const result = await mutate(`/api/quotes/${quote.id}/convert`, { method: "POST" });
              notify("Facture brouillon créée.");
              navigate(`/factures/${result.createdId}`);
            })}>Convertir en facture</button>
          ) : null}
        </div>
      </header>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {quote.status === "draft" ? <p className="hint" style={{ marginBottom: 12 }}>Marquer comme envoyé ne déclenche pas d'e-mail. L'envoi des devis arrivera dans une prochaine version.</p> : null}
      <div className="actions" style={{ marginBottom: 16 }}>
        {quote.status === "draft" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("sent", "Devis marqué comme envoyé."))}>Marquer comme envoyé</button> : null}
        {quote.status === "sent" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("accepted", "Devis accepté."))}>Accepter</button> : null}
        {quote.status === "sent" || quote.status === "accepted" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("refused", "Devis refusé."))}>Refuser</button> : null}
        {quote.status === "sent" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("draft", "Devis remis en brouillon."))}>Repasser en brouillon</button> : null}
        {quote.status === "accepted" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("sent", "Devis marqué comme envoyé."))}>Marquer comme envoyé</button> : null}
        {quote.status === "refused" ? <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(() => status("sent", "Devis rouvert."))}>Rouvrir</button> : null}
        <button className="btn btn-ghost btn-small" type="button" disabled={busy} onClick={() => run(async () => {
          const result = await mutate(`/api/quotes/${quote.id}/duplicate`, { method: "POST" });
          notify("Copie créée en brouillon.");
          navigate(`/devis/${result.createdId}`);
        })}>Dupliquer</button>
        {quote.status === "draft" ? <button className="btn btn-danger btn-small" type="button" onClick={() => setConfirmDelete(true)}>Supprimer</button> : null}
        {invoice ? <Link className="btn btn-ghost btn-small" to={`/factures/${invoice.id}`}>{invoice.number ? `Facture ${invoice.number}` : "Facture brouillon"}</Link> : null}
      </div>
      <section className="card">
        <dl className="dl">
          <dt>Date</dt><dd>{formatDate(quote.issueDate)}</dd>
          <dt>Validité</dt><dd>{formatDate(quote.validUntil)}</dd>
          <dt>Statut</dt><dd>{QUOTE_STATUS_LABEL[quote.status]}</dd>
        </dl>
        <LinesTable lines={quote.lines} currency={quote.currencyCode} />
        <Totals currency={quote.currencyCode} ht={totals.ht} vat={totals.vatBreakdown} ttc={totals.ttc} />
        {quote.notes ? <p style={{ marginTop: 16 }}>{quote.notes}</p> : null}
        {quote.terms ? <p className="hint" style={{ marginTop: 8 }}>{quote.terms}</p> : null}
      </section>
      {confirmDelete ? (
        <ConfirmDialog
          title="Supprimer ce brouillon ?"
          body="Le numéro de devis ne sera pas réattribué."
          confirmLabel="Supprimer"
          danger
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => run(async () => {
            await mutate(`/api/quotes/${quote.id}`, { method: "DELETE" });
            notify("Devis supprimé.");
            navigate("/devis");
          })}
        />
      ) : null}
    </>
  );

  function status(next: QuoteStatus, message: string) {
    return mutate(`/api/quotes/${quote!.id}/status`, { method: "POST", body: JSON.stringify({ status: next }) }).then(() => notify(message));
  }
}

export function LinesTable({ lines, currency = "EUR" }: { lines: { id: string; description: string; quantity: number; unit: string; unitPriceCents: number; vatBps: number }[]; currency?: string }) {
  return (
    <div className="table-wrap" style={{ marginTop: 16 }}>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th className="right">Qté</th>
            <th>Unité</th>
            <th className="right">PU HT</th>
            <th className="right">TVA</th>
            <th className="right">Montant HT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td style={{ whiteSpace: "pre-wrap" }}>{line.description}</td>
              <td className="right">{formatQty(line.quantity)}</td>
              <td>{line.unit}</td>
              <td className="right"><Money cents={line.unitPriceCents} currency={currency} /></td>
              <td className="right">{vatLabel(line.vatBps)}</td>
              <td className="right"><Money cents={lineAmounts(line).ht} currency={currency} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Totals({
  ht,
  vat,
  ttc,
  currency = "EUR",
  extra,
}: {
  ht: number;
  vat: { bps: number; vat: number }[];
  ttc: number;
  currency?: string;
  extra?: { label: string; cents: number; strong?: boolean; className?: string }[];
}) {
  return (
    <div className="totals" style={{ marginTop: 16 }}>
      <div className="total-row"><span>Total HT</span><Money cents={ht} currency={currency} /></div>
      {vat.map((entry) => (
        <div className="total-row" key={entry.bps}><span>TVA {vatLabel(entry.bps)}</span><Money cents={entry.vat} currency={currency} /></div>
      ))}
      <div className="total-row strong"><span>Total TTC</span><Money cents={ttc} currency={currency} /></div>
      {extra?.map((entry) => (
        <div className={entry.strong ? "total-row strong" : "total-row"} key={entry.label}>
          <span>{entry.label}</span>
          <span className={entry.className}><Money cents={entry.cents} currency={currency} /></span>
        </div>
      ))}
    </div>
  );
}
