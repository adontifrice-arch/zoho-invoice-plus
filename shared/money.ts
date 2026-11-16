import type { CreditNote, Invoice, InvoiceViewStatus, Line, Payment, Quote } from "./types.js";
import { VAT_RATES } from "./types.js";

export function isVatBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 10000;
}

export function vatLabel(bps: number): string {
  const known = VAT_RATES.find((rate) => rate.bps === bps);
  if (known) return known.label;
  const text = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(bps / 100);
  return `${text} %`;
}

export function lineAmounts(line: Pick<Line, "quantity" | "unitPriceCents" | "vatBps">): {
  ht: number;
  vat: number;
  ttc: number;
} {
  const ht = Math.round(line.quantity * line.unitPriceCents);
  const vat = Math.round((ht * line.vatBps) / 10000);
  return { ht, vat, ttc: ht + vat };
}

export function documentTotals(lines: Line[]): {
  ht: number;
  vat: number;
  ttc: number;
  vatBreakdown: { bps: number; ht: number; vat: number }[];
} {
  const buckets = new Map<number, { ht: number; vat: number }>();
  let ht = 0;
  let vat = 0;
  for (const line of lines) {
    const amounts = lineAmounts(line);
    ht += amounts.ht;
    vat += amounts.vat;
    const bucket = buckets.get(line.vatBps) ?? { ht: 0, vat: 0 };
    bucket.ht += amounts.ht;
    bucket.vat += amounts.vat;
    buckets.set(line.vatBps, bucket);
  }
  return {
    ht,
    vat,
    ttc: ht + vat,
    vatBreakdown: [...buckets.entries()]
      .map(([bps, amounts]) => ({ bps, ...amounts }))
      .sort((a, b) => b.bps - a.bps),
  };
}

export type InvoiceBalance = {
  ht: number;
  vat: number;
  ttc: number;
  credited: number;
  paid: number;
  due: number;
  vatBreakdown: { bps: number; ht: number; vat: number }[];
};

export function invoiceBalance(
  invoice: Invoice,
  creditNotes: CreditNote[],
  payments: Payment[],
): InvoiceBalance {
  const totals = documentTotals(invoice.lines);
  const credited = creditNotes
    .filter((note) => note.invoiceId === invoice.id)
    .reduce((sum, note) => sum + documentTotals(note.lines).ttc, 0);
  const paid = payments
    .filter((payment) => payment.invoiceId === invoice.id)
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  return { ...totals, credited, paid, due: totals.ttc - credited - paid };
}

export function invoiceViewStatus(
  invoice: Invoice,
  balance: Pick<InvoiceBalance, "due" | "paid" | "credited">,
  today: string,
): InvoiceViewStatus {
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (balance.due <= 0) return "paid";
  if (invoice.dueDate < today) return "overdue";
  if (balance.paid > 0 || balance.credited > 0) return "partial";
  return "issued";
}

export function quoteExpired(quote: Quote, today: string): boolean {
  return (quote.status === "sent" || quote.status === "accepted") && quote.validUntil < today;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function defaultInvoiceTerms(days: number): string {
  const delay = days <= 0 ? "à réception" : `sous ${days} jours`;
  return `Paiement ${delay} à compter de la date de facture. Pas d'escompte pour paiement anticipé. En cas de retard, pénalités au taux légal en vigueur et indemnité forfaitaire de recouvrement de 40 € (article L441-10 du code de commerce).`;
}

export function defaultQuoteTerms(days: number): string {
  return `Devis valable ${days} jours à compter de sa date d'émission. L'acceptation du devis vaut commande et donne lieu à une facture.`;
}
