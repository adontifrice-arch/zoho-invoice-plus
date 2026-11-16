import { documentTotals, invoiceBalance, invoiceViewStatus } from "./money.js";
import type { InvoiceViewStatus, Store } from "./types.js";

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function baseCurrencyCode(store: Pick<Store, "currencies">): string {
  const code = store.currencies.find((currency) => currency.isBase)?.code?.toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

export function moneyCode(code: string | undefined): string {
  const value = (code || "EUR").toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : "EUR";
}

export function openDueByCurrency(store: Omit<Store, "zoho">, customerId: string): { code: string; cents: number }[] {
  const totals = new Map<string, number>();
  for (const invoice of store.invoices) {
    if (invoice.customerId !== customerId || invoice.status !== "issued") continue;
    const due = invoiceBalance(invoice, store.creditNotes, store.payments).due;
    if (due === 0) continue;
    const code = moneyCode(invoice.currencyCode);
    totals.set(code, (totals.get(code) ?? 0) + due);
  }
  return [...totals.entries()].map(([code, cents]) => ({ code, cents }));
}

export type Dashboard = {
  baseCurrency: string;
  unpaidCount: number;
  unpaidCents: number;
  overdueCount: number;
  overdueCents: number;
  collectedThisMonth: number;
  billedThisMonth: number;
  openQuoteCount: number;
  openQuoteCents: number;
  acceptedQuoteCount: number;
  acceptedQuoteCents: number;
  foreignUnpaid: { code: string; cents: number }[];
};

export function dashboard(store: Omit<Store, "zoho">, today: string): Dashboard {
  const month = monthOf(today);
  const base = baseCurrencyCode(store);
  let unpaidCount = 0;
  let unpaidCents = 0;
  let overdueCount = 0;
  let overdueCents = 0;
  let billedThisMonth = 0;
  const foreign = new Map<string, number>();

  for (const invoice of store.invoices) {
    const balance = invoiceBalance(invoice, store.creditNotes, store.payments);
    const status: InvoiceViewStatus = invoiceViewStatus(invoice, balance, today);
    const code = moneyCode(invoice.currencyCode);
    const inBase = code === base;
    if (status === "issued" || status === "partial" || status === "overdue") {
      if (inBase) {
        unpaidCount += 1;
        unpaidCents += balance.due;
      } else if (balance.due !== 0) {
        foreign.set(code, (foreign.get(code) ?? 0) + balance.due);
      }
    }
    if (status === "overdue" && inBase) {
      overdueCount += 1;
      overdueCents += balance.due;
    }
    if (invoice.status === "issued" && monthOf(invoice.issueDate) === month && inBase) {
      billedThisMonth += balance.ttc;
    }
  }

  for (const note of store.creditNotes) {
    if (monthOf(note.issueDate) !== month) continue;
    const invoice = store.invoices.find((entry) => entry.id === note.invoiceId);
    if (!invoice || moneyCode(invoice.currencyCode) !== base) continue;
    billedThisMonth -= documentTotals(note.lines).ttc;
  }

  const collectedThisMonth = store.payments
    .filter((payment) => monthOf(payment.date) === month && moneyCode(payment.currencyCode) === base)
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  const openQuotes = store.quotes.filter((quote) => quote.status === "sent" && moneyCode(quote.currencyCode) === base);
  const acceptedQuotes = store.quotes.filter((quote) => quote.status === "accepted" && moneyCode(quote.currencyCode) === base);

  return {
    baseCurrency: base,
    unpaidCount,
    unpaidCents,
    overdueCount,
    overdueCents,
    collectedThisMonth,
    billedThisMonth,
    openQuoteCount: openQuotes.length,
    openQuoteCents: openQuotes.reduce((sum, quote) => sum + documentTotals(quote.lines).ttc, 0),
    acceptedQuoteCount: acceptedQuotes.length,
    acceptedQuoteCents: acceptedQuotes.reduce((sum, quote) => sum + documentTotals(quote.lines).ttc, 0),
    foreignUnpaid: [...foreign.entries()].map(([code, cents]) => ({ code, cents })),
  };
}
