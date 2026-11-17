import { Link } from "react-router-dom";
import { customerTitle, formatMoney, formatWeekdayDate, relativeDay } from "../../shared/format";
import { documentTotals, invoiceBalance, invoiceViewStatus } from "../../shared/money";
import { dashboard } from "../../shared/stats";
import type { MonthBar } from "../../shared/stats";
import { paymentMethodLabel } from "../../shared/labels";
import { useApp } from "../store";
import { InvoiceBadge, Money, QuoteBadge, useTitle } from "../ui";

function MonthChart({ months }: { months: MonthBar[] }) {
  const peak = Math.max(1, ...months.flatMap((month) => [month.billed, month.collected]));
  return (
    <div className="chart" role="img" aria-label="Facturé et encaissé sur six mois">
      {months.map((month) => (
        <div className="chart-col" key={month.key}>
          <div className="chart-bars">
            <div className="chart-bar billed" style={{ height: `${Math.max(2, (month.billed / peak) * 132)}px` }} title={formatMoney(month.billed)} />
            <div className="chart-bar collected" style={{ height: `${Math.max(2, (month.collected / peak) * 132)}px` }} title={formatMoney(month.collected)} />
          </div>
          <span>{month.label}</span>
        </div>
      ))}
    </div>
  );
}

function Aging({ current, overdue, currency }: { current: number; overdue: number; currency: string }) {
  const total = current + overdue;
  const currentWidth = total === 0 ? 0 : (current / total) * 100;
  const overdueWidth = total === 0 ? 0 : (overdue / total) * 100;
  return (
    <>
      <div className="aging" aria-hidden="true">
        <span className="current" style={{ width: `${currentWidth}%` }} />
        <span className="late" style={{ width: `${overdueWidth}%` }} />
      </div>
      <p className="hint">À échoir {formatMoney(current, currency)}</p>
      <p className="hint" style={{ color: "var(--clay)" }}>En retard {formatMoney(overdue, currency)}</p>
      {total === 0 ? <p className="empty">Aucune créance ouverte dans la devise de base.</p> : null}
    </>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function Dashboard() {
  const { state } = useApp();
  useTitle("Tableau de bord");
  if (!state) return null;
  const stats = dashboard(state, state.today);
  const customerOf = (id: string) => state.customers.find((customer) => customer.id === id);

  const follow = state.invoices
    .map((invoice) => ({ invoice, balance: invoiceBalance(invoice, state.creditNotes, state.payments) }))
    .filter(({ invoice, balance }) => {
      const status = invoiceViewStatus(invoice, balance, state.today);
      return status === "issued" || status === "partial" || status === "overdue";
    })
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate))
    .slice(0, 6);

  const quotes = state.quotes
    .filter((quote) => quote.status === "sent" || quote.status === "accepted")
    .sort((a, b) => a.validUntil.localeCompare(b.validUntil));

  const payments = [...state.payments].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 5);

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Registre</p>
          <h1>Tableau de bord</h1>
          <p className="lede">{capitalise(formatWeekdayDate(state.today))}</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" to="/devis/nouveau">Nouveau devis</Link>
          <Link className="btn btn-primary" to="/factures/nouvelle">Nouvelle facture</Link>
        </div>
      </header>

      <section className="kpis">
        <article className="kpi">
          <span>Impayé</span>
          <strong>{formatMoney(stats.unpaidCents, stats.baseCurrency)}</strong>
          <em>{stats.unpaidCount} facture{stats.unpaidCount > 1 ? "s" : ""}</em>
        </article>
        <article className="kpi kpi-alert">
          <span>En retard</span>
          <strong>{formatMoney(stats.overdueCents, stats.baseCurrency)}</strong>
          <em>{stats.overdueCount} facture{stats.overdueCount > 1 ? "s" : ""}</em>
        </article>
        <article className="kpi kpi-good">
          <span>Encaissé ce mois</span>
          <strong>{formatMoney(stats.collectedThisMonth, stats.baseCurrency)}</strong>
          <em>Paiements datés de ce mois</em>
        </article>
        <article className="kpi">
          <span>Facturé ce mois</span>
          <strong>{formatMoney(stats.billedThisMonth, stats.baseCurrency)}</strong>
          <em>Émissions moins avoirs</em>
        </article>
      </section>
      {stats.foreignUnpaid.length > 0 ? (
        <p className="hint">
          Les totaux ci-dessus sont en {stats.baseCurrency}. Soldes ouverts dans d'autres devises, sans conversion : {stats.foreignUnpaid.map((row) => formatMoney(row.cents, row.code)).join(", ")}.
        </p>
      ) : null}

      <div className="overview">
        <section className="card">
          <div className="section-title">
            <h2>Activité sur 6 mois</h2>
            <span>{stats.baseCurrency}</span>
          </div>
          <MonthChart months={stats.months} />
          <div className="legend">
            <span><i className="billed" /> Facturé</span>
            <span><i className="collected" /> Encaissé</span>
          </div>
        </section>
        <section className="card">
          <div className="section-title">
            <h2>Créances ouvertes</h2>
            <span>{formatMoney(stats.unpaidCents, stats.baseCurrency)}</span>
          </div>
          <Aging current={stats.currentCents} overdue={stats.overdueCents} currency={stats.baseCurrency} />
        </section>
      </div>

      <div className="split">
        <section className="card">
          <div className="section-title">
            <h2>Factures à suivre</h2>
            <Link to="/factures">Tout voir</Link>
          </div>
          {follow.length === 0 ? <p className="empty">Aucune facture ouverte.</p> : follow.map(({ invoice, balance }) => {
            const customer = customerOf(invoice.customerId);
            return (
              <Link className="list-link" key={invoice.id} to={`/factures/${invoice.id}`}>
                <strong>{invoice.number}</strong>
                <span className="list-meta"><Money cents={balance.due} currency={invoice.currencyCode} /></span>
                <small>{customer ? customerTitle(customer) : "Client"} · échéance {relativeDay(invoice.dueDate, state.today)}</small>
                <span className="list-meta"><InvoiceBadge state={state} invoice={invoice} /></span>
              </Link>
            );
          })}
        </section>
        <section className="card">
          <div className="section-title">
            <h2>Devis en cours</h2>
            <Link to="/devis">Tout voir</Link>
          </div>
          <p className="hint" style={{ marginBottom: 4 }}>
            {stats.openQuoteCount} envoyé{stats.openQuoteCount > 1 ? "s" : ""} · {stats.acceptedQuoteCount} accepté{stats.acceptedQuoteCount > 1 ? "s" : ""}
          </p>
          {quotes.length === 0 ? <p className="empty">Aucun devis en attente.</p> : quotes.map((quote) => {
            const customer = customerOf(quote.customerId);
            return (
              <Link className="list-link" key={quote.id} to={`/devis/${quote.id}`}>
                <strong>{quote.number}</strong>
                <span className="list-meta"><Money cents={documentTotals(quote.lines).ttc} currency={quote.currencyCode} /></span>
                <small>{customer ? customerTitle(customer) : "Client"} · {relativeDay(quote.validUntil, state.today)}</small>
                <span className="list-meta"><QuoteBadge state={state} quote={quote} /></span>
              </Link>
            );
          })}
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-title">
          <h2>Derniers paiements</h2>
          <Link to="/paiements">Tout voir</Link>
        </div>
        {payments.length === 0 ? <p className="empty">Aucun paiement enregistré.</p> : payments.map((payment) => {
          const invoice = state.invoices.find((entry) => entry.id === payment.invoiceId);
          const customer = customerOf(payment.customerId);
          return (
            <Link className="list-link" key={payment.id} to={invoice ? `/factures/${invoice.id}` : "/paiements"}>
              <strong>{payment.number}</strong>
              <span className="list-meta"><Money cents={payment.amountCents} currency={payment.currencyCode} /></span>
              <small>
                {customer ? customerTitle(customer) : "Client"} · {paymentMethodLabel(payment.method)}
                {invoice?.number ? ` · ${invoice.number}` : ""}
              </small>
              <span className="list-meta muted">{relativeDay(payment.date, state.today)}</span>
            </Link>
          );
        })}
      </section>
    </>
  );
}
