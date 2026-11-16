import { documentTotals, invoiceBalance, invoiceViewStatus } from "./money.js";
import type { InvoiceViewStatus, Store } from "./types.js";

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function customerBalance(store: Store, customerId: string): number {
  return store.invoices
    .filter((invoice) => invoice.customerId === customerId && invoice.status === "issued")
    .reduce((sum, invoice) => sum + invoiceBalance(invoice, store.creditNotes, store.payments).due, 0);
}

export type Dashboard = {
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
};

export function dashboard(store: Store, today: string): Dashboard {
  const month = monthOf(today);
  let unpaidCount = 0;
  let unpaidCents = 0;
  let overdueCount = 0;
  let overdueCents = 0;
  let billedThisMonth = 0;

  for (const invoice of store.invoices) {
    const balance = invoiceBalance(invoice, store.creditNotes, store.payments);
    const status: InvoiceViewStatus = invoiceViewStatus(invoice, balance, today);
    if (status === "issued" || status === "partial" || status === "overdue") {
      unpaidCount += 1;
      unpaidCents += balance.due;
    }
    if (status === "overdue") {
      overdueCount += 1;
      overdueCents += balance.due;
    }
    if (invoice.status === "issued" && monthOf(invoice.issueDate) === month) {
      billedThisMonth += balance.ttc;
    }
  }

  for (const note of store.creditNotes) {
    if (monthOf(note.issueDate) === month) billedThisMonth -= documentTotals(note.lines).ttc;
  }

  const collectedThisMonth = store.payments
    .filter((payment) => monthOf(payment.date) === month)
    .reduce((sum, payment) => sum + payment.amountCents, 0);

  const openQuotes = store.quotes.filter((quote) => quote.status === "sent");
  const acceptedQuotes = store.quotes.filter((quote) => quote.status === "accepted");

  return {
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
  };
}
