import { addDays } from "./money.js";
import type {
  Currency,
  Customer,
  ImportReport,
  ImportTally,
  Invoice,
  InvoiceStatus,
  Item,
  Line,
  Payment,
  PaymentMethod,
  Quote,
  QuoteStatus,
  Store,
  Tax,
} from "./types.js";

export type ZohoBundle = {
  currencies: unknown[];
  taxes: unknown[];
  contacts: unknown[];
  items: unknown[];
  estimates: unknown[];
  invoices: unknown[];
  payments: unknown[];
};

export type MergeAction = "created" | "updated" | "unchanged" | "skipped";

type Origin = { id: string; zohoId: string | null; locallyEdited: boolean };

const ERROR_LIMIT = 30;

export function emptyTally(): ImportTally {
  return { created: 0, updated: 0, unchanged: 0, skipped: 0 };
}

export function emptyReport(): ImportReport {
  return {
    customers: emptyTally(),
    items: emptyTally(),
    quotes: emptyTally(),
    invoices: emptyTally(),
    payments: emptyTally(),
    taxes: emptyTally(),
    currencies: emptyTally(),
    errors: [],
  };
}

export function ignoreZohoId<T extends { zoho: Store["zoho"] }>(store: T, zohoId: string | null): T {
  if (!zohoId || store.zoho.ignoredIds.includes(zohoId)) return store;
  return { ...store, zoho: { ...store.zoho, ignoredIds: [...store.zoho.ignoredIds, zohoId] } };
}

export function toCents(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(number)) return 0;
  const cents = Math.round((number + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) return 0;
  return cents;
}

export function toBps(percent: unknown): number {
  const number = typeof percent === "number" ? percent : typeof percent === "string" ? Number(percent.replace(/\s/g, "").replace(",", ".")) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(10000, Math.max(0, Math.round(number * 100)));
}

export function mapInvoiceStatus(status: unknown): InvoiceStatus {
  const value = text(status, 40).toLowerCase();
  if (value === "void") return "void";
  if (value === "draft") return "draft";
  return "issued";
}

export function mapQuoteStatus(status: unknown): QuoteStatus {
  switch (text(status, 40).toLowerCase()) {
    case "draft":
      return "draft";
    case "accepted":
      return "accepted";
    case "declined":
    case "rejected":
      return "refused";
    case "invoiced":
      return "invoiced";
    default:
      return "sent";
  }
}

export function mapPaymentMethod(mode: unknown): PaymentMethod {
  const value = text(mode, 80).toLowerCase().replace(/[\s_-]/g, "");
  if (value.includes("cash") || value.includes("espece") || value.includes("espèce")) return "cash";
  if (value.includes("check") || value.includes("cheque") || value.includes("chèque")) return "check";
  if (value.includes("card") || value.includes("creditcard") || value.includes("stripe")) return "card";
  if (value.includes("bank") || value.includes("transfer") || value.includes("virement") || value.includes("wire") || value.includes("remittance")) {
    return "transfer";
  }
  return "other";
}

export function applyZohoImport(store: Store, bundle: ZohoBundle, clock: { now: string; today: string }): { store: Store; report: ImportReport } {
  const report = emptyReport();
  const ignored = new Set(store.zoho.ignoredIds);
  let currencies = store.currencies.slice();
  let taxes = store.taxes.slice();
  let customers = store.customers.slice();
  let items = store.items.slice();
  let invoices = store.invoices.slice();
  let quotes = store.quotes.slice();
  let payments = store.payments.slice();

  for (const raw of bundle.currencies) {
    const incoming = mapCurrency(raw, clock.now);
    if (!incoming) {
      note(report, "Une devise Zoho est illisible.");
      continue;
    }
    const merged = mergeByZohoId(currencies, incoming, ignored);
    currencies = merged.rows;
    report.currencies[merged.action] += 1;
  }

  for (const raw of bundle.taxes) {
    const incoming = mapTax(raw, clock.now);
    if (!incoming) {
      note(report, "Une taxe Zoho est illisible.");
      continue;
    }
    const merged = mergeByZohoId(taxes, incoming, ignored);
    taxes = merged.rows;
    report.taxes[merged.action] += 1;
  }

  const customerIds = indexByZoho(customers);
  for (const raw of bundle.contacts) {
    const incoming = mapContact(raw, clock.now);
    if (!incoming) {
      note(report, "Un client Zoho est illisible.");
      continue;
    }
    const merged = mergeByZohoId(customers, incoming, ignored);
    customers = merged.rows;
    report.customers[merged.action] += 1;
    if (merged.action !== "skipped" && incoming.zohoId) {
      const saved = customers.find((entry) => entry.zohoId === incoming.zohoId);
      if (saved) customerIds.set(incoming.zohoId, saved.id);
    }
  }

  const itemIds = indexByZoho(items);
  for (const raw of bundle.items) {
    const incoming = mapItem(raw, clock.now);
    if (!incoming) {
      note(report, "Un article Zoho est illisible.");
      continue;
    }
    const merged = mergeByZohoId(items, incoming, ignored);
    items = merged.rows;
    report.items[merged.action] += 1;
    if (merged.action !== "skipped" && incoming.zohoId) {
      const saved = items.find((entry) => entry.zohoId === incoming.zohoId);
      if (saved) itemIds.set(incoming.zohoId, saved.id);
    }
  }

  const invoiceZohoByEstimate = new Map<string, string>();
  for (const raw of bundle.invoices) {
    if (!isRecord(raw)) {
      note(report, "Une facture Zoho est illisible.");
      continue;
    }
    const zohoId = text(raw.invoice_id, 80);
    const customerId = customerIds.get(text(raw.customer_id, 80));
    if (!zohoId || !customerId) {
      note(report, `Facture ${text(raw.invoice_number, 40) || zohoId || "Zoho"} : client introuvable, ligne ignorée.`);
      report.invoices.skipped += 1;
      continue;
    }
    const incoming = mapInvoice(raw, clock, customerId, itemIds);
    const merged = mergeByZohoId(invoices, incoming, ignored, (current, next) => ({
      ...next,
      quoteId: next.quoteId ?? current.quoteId,
    }));
    invoices = merged.rows;
    report.invoices[merged.action] += 1;
    const estimateId = text(raw.estimate_id, 80);
    if (estimateId) invoiceZohoByEstimate.set(estimateId, zohoId);
  }

  const invoiceByZoho = indexByZoho(invoices);
  for (const raw of bundle.estimates) {
    if (!isRecord(raw)) {
      note(report, "Un devis Zoho est illisible.");
      continue;
    }
    const zohoId = text(raw.estimate_id, 80);
    const customerId = customerIds.get(text(raw.customer_id, 80));
    if (!zohoId || !customerId) {
      note(report, `Devis ${text(raw.estimate_number, 40) || zohoId || "Zoho"} : client introuvable, ligne ignorée.`);
      report.quotes.skipped += 1;
      continue;
    }
    const linkedZoho = invoiceZohoByEstimate.get(zohoId) || text(raw.invoice_id, 80);
    const invoiceId = linkedZoho ? invoiceByZoho.get(linkedZoho) ?? null : null;
    const incoming = mapQuote(raw, clock, customerId, itemIds, invoiceId);
    const merged = mergeByZohoId(quotes, incoming, ignored, (current, next) => ({
      ...next,
      invoiceId: next.invoiceId ?? current.invoiceId,
    }));
    quotes = merged.rows;
    report.quotes[merged.action] += 1;
  }

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  for (const raw of bundle.payments) {
    const parts = mapPaymentParts(raw, clock.now, invoiceByZoho, invoiceById);
    if (parts.length === 0) {
      const label = isRecord(raw) ? text(raw.payment_number, 40) || text(raw.payment_id, 40) : "";
      note(report, `Paiement ${label || "Zoho"} : aucune facture correspondante, ligne ignorée.`);
      report.payments.skipped += 1;
      continue;
    }
    for (const incoming of parts) {
      const merged = mergeByZohoId(payments, incoming, ignored);
      payments = merged.rows;
      report.payments[merged.action] += 1;
    }
  }

  const quoteIdByZoho = indexByZoho(quotes);
  invoices = invoices.map((invoice) => {
    if (!invoice.zohoId || invoice.locallyEdited || invoice.quoteId) return invoice;
    const estimateId = [...invoiceZohoByEstimate.entries()].find(([, invoiceZoho]) => invoiceZoho === invoice.zohoId)?.[0];
    const quoteId = estimateId ? quoteIdByZoho.get(estimateId) : undefined;
    return quoteId ? { ...invoice, quoteId } : invoice;
  });

  return {
    store: { ...store, currencies, taxes, customers, items, invoices, quotes, payments },
    report,
  };
}

function mergeByZohoId<T extends Origin>(
  rows: T[],
  incoming: T,
  ignored: ReadonlySet<string>,
  finish: (current: T, next: T) => T = (_current, next) => next,
): { rows: T[]; action: MergeAction } {
  if (!incoming.zohoId) return { rows, action: "skipped" };
  const index = rows.findIndex((row) => row.zohoId === incoming.zohoId);
  if (index === -1) {
    if (ignored.has(incoming.zohoId)) return { rows, action: "skipped" };
    return { rows: [...rows, incoming], action: "created" };
  }
  const current = rows[index];
  if (current.locallyEdited) return { rows, action: "skipped" };
  const base = { ...incoming, id: current.id } as T;
  if ("createdAt" in current && "createdAt" in base) {
    (base as { createdAt: string }).createdAt = (current as { createdAt: string }).createdAt;
  }
  const next = finish(current, base);
  if (fingerprint(current) === fingerprint(next)) return { rows, action: "unchanged" };
  const copy = rows.slice();
  copy[index] = next;
  return { rows: copy, action: "updated" };
}

function fingerprint(value: object): string {
  return JSON.stringify(value, (key, nested) => (key === "id" || key === "createdAt" || key === "updatedAt" ? undefined : nested));
}

function indexByZoho<T extends { id: string; zohoId: string | null }>(rows: T[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) if (row.zohoId) map.set(row.zohoId, row.id);
  return map;
}

function note(report: ImportReport, message: string): void {
  if (report.errors.length < ERROR_LIMIT) report.errors.push(message);
}

function mapContact(raw: unknown, now: string): Customer | null {
  if (!isRecord(raw)) return null;
  const zohoId = text(raw.contact_id, 80);
  if (!zohoId) return null;
  const persons = Array.isArray(raw.contact_persons) ? raw.contact_persons.filter(isRecord) : [];
  const primary = persons.find((person) => person.is_primary_contact === true) ?? persons[0];
  const billing = isRecord(raw.billing_address) ? raw.billing_address : {};
  const name = text(raw.contact_name, 160);
  const company = text(raw.company_name, 160);
  const contacts = persons.flatMap((person, index) => {
    const email = emailOf(person.email);
    if (!email) return [];
    const personName = [text(person.first_name, 80), text(person.last_name, 80)].filter(Boolean).join(" ").slice(0, 160);
    return [
      {
        id: nid("ctc"),
        name: personName || name,
        email,
        role: text(person.designation ?? person.department, 80),
        isPrimary: person.is_primary_contact === true || (!persons.some((entry) => entry.is_primary_contact === true) && index === 0),
      },
    ];
  });
  const fallbackEmail = emailOf(primary?.email ?? raw.email);
  if (contacts.length === 0 && fallbackEmail) {
    contacts.push({
      id: nid("ctc"),
      name: name || company || "",
      email: fallbackEmail,
      role: "",
      isPrimary: true,
    });
  }
  if (contacts.length > 0 && !contacts.some((entry) => entry.isPrimary)) contacts[0].isPrimary = true;
  const primaryContact = contacts.find((entry) => entry.isPrimary) ?? contacts[0];
  return {
    id: nid("cus"),
    zohoId,
    locallyEdited: false,
    name: name || company || "Client Zoho",
    company,
    email: primaryContact?.email || fallbackEmail,
    phone: text(primary?.phone ?? primary?.mobile ?? raw.phone ?? raw.mobile, 40),
    address: [text(billing.address, 180), text(billing.street2, 180)].filter(Boolean).join(", ").slice(0, 240),
    postalCode: text(billing.zip, 16),
    city: text(billing.city, 80),
    country: text(billing.country, 80) || "France",
    siret: "",
    vatNumber: text(raw.vat_reg_no ?? raw.tax_reg_no, 40),
    notes: text(raw.notes, 4000),
    contacts,
    archived: text(raw.status, 20).toLowerCase() === "inactive",
    createdAt: now,
    updatedAt: now,
  };
}

function mapItem(raw: unknown, now: string): Item | null {
  if (!isRecord(raw)) return null;
  const zohoId = text(raw.item_id, 80);
  const name = text(raw.name, 160);
  if (!zohoId || !name) return null;
  return {
    id: nid("item"),
    zohoId,
    locallyEdited: false,
    name,
    description: text(raw.description, 2000),
    sku: text(raw.sku, 40).toUpperCase(),
    unitPriceCents: toCents(raw.rate),
    unit: text(raw.unit, 20) || "unité",
    vatBps: toBps(raw.tax_percentage),
    active: text(raw.status, 20).toLowerCase() !== "inactive",
    createdAt: now,
    updatedAt: now,
  };
}

function mapCurrency(raw: unknown, now: string): Currency | null {
  if (!isRecord(raw)) return null;
  const code = text(raw.currency_code, 8).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  const zohoId = text(raw.currency_id, 80) || code;
  return {
    id: nid("cur"),
    zohoId,
    locallyEdited: false,
    code,
    name: text(raw.currency_name, 80) || code,
    symbol: text(raw.currency_symbol, 8) || code,
    isBase: raw.is_base_currency === true || raw.is_base_currency === "true",
    createdAt: now,
    updatedAt: now,
  };
}

function mapTax(raw: unknown, now: string): Tax | null {
  if (!isRecord(raw)) return null;
  const zohoId = text(raw.tax_id, 80);
  const name = text(raw.tax_name, 80);
  if (!zohoId || !name) return null;
  return {
    id: nid("tax"),
    zohoId,
    locallyEdited: false,
    name,
    rateBps: toBps(raw.tax_percentage),
    createdAt: now,
    updatedAt: now,
  };
}

function mapInvoice(raw: Record<string, unknown>, clock: { now: string; today: string }, customerId: string, itemIds: Map<string, string>): Invoice {
  const issueDate = dateOf(raw.date, clock.today);
  const status = mapInvoiceStatus(raw.status);
  const number = text(raw.invoice_number, 40);
  return {
    id: nid("inv"),
    zohoId: text(raw.invoice_id, 80),
    locallyEdited: false,
    currencyCode: currencyOf(raw),
    number: number || (status === "draft" ? "" : `ZOHO-${text(raw.invoice_id, 8)}`),
    customerId,
    quoteId: null,
    status,
    issueDate,
    dueDate: dateNotBefore(dateOf(raw.due_date, issueDate), issueDate),
    lines: mapLines(raw, itemIds),
    notes: text(raw.notes, 4000),
    terms: text(raw.terms, 4000),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
}

function mapQuote(
  raw: Record<string, unknown>,
  clock: { now: string; today: string },
  customerId: string,
  itemIds: Map<string, string>,
  invoiceId: string | null,
): Quote {
  const issueDate = dateOf(raw.date, clock.today);
  let status = mapQuoteStatus(raw.status);
  if (invoiceId && status !== "draft" && status !== "refused") status = "invoiced";
  const number = text(raw.estimate_number, 40);
  return {
    id: nid("quo"),
    zohoId: text(raw.estimate_id, 80),
    locallyEdited: false,
    currencyCode: currencyOf(raw),
    number: number || `ZOHO-${text(raw.estimate_id, 8)}`,
    customerId,
    status,
    issueDate,
    validUntil: dateNotBefore(dateOf(raw.expiry_date, addDays(issueDate, 30)), issueDate),
    lines: mapLines(raw, itemIds),
    notes: text(raw.notes, 4000),
    terms: text(raw.terms, 4000),
    invoiceId,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
}

function mapPaymentParts(
  raw: unknown,
  now: string,
  invoiceByZoho: Map<string, string>,
  invoiceById: Map<string, Invoice>,
): Payment[] {
  if (!isRecord(raw)) return [];
  const paymentId = text(raw.payment_id, 80);
  if (!paymentId) return [];
  const applied = Array.isArray(raw.invoices) ? raw.invoices.filter(isRecord) : [];
  const number = text(raw.payment_number, 40) || `ZOHO-${paymentId.slice(0, 8)}`;
  const date = dateOf(raw.date, now.slice(0, 10));
  const method = mapPaymentMethod(raw.payment_mode);
  const reference = text(raw.reference_number, 140);
  const notes = text(raw.description ?? raw.notes, 2000);
  const currency = currencyOf(raw);
  const parts: Payment[] = [];
  applied.forEach((row, index) => {
    const invoiceZoho = text(row.invoice_id, 80);
    const invoiceId = invoiceByZoho.get(invoiceZoho);
    const invoice = invoiceId ? invoiceById.get(invoiceId) : undefined;
    if (!invoice) return;
    const amount = toCents(row.amount_applied ?? row.amount);
    if (amount === 0) return;
    parts.push({
      id: nid("pay"),
      zohoId: `${paymentId}:${invoiceZoho}`,
      locallyEdited: false,
      currencyCode: currency || invoice.currencyCode,
      number: applied.length > 1 ? `${number}-${index + 1}` : number,
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amountCents: Math.abs(amount),
      date,
      method,
      reference,
      notes,
      createdAt: now,
    });
  });
  return parts;
}

function mapLines(raw: Record<string, unknown>, itemIds: Map<string, string>): Line[] {
  const source = Array.isArray(raw.line_items) ? raw.line_items.filter(isRecord) : [];
  const lines: Line[] = [];
  for (const entry of source) {
    let quantity = typeof entry.quantity === "number" ? entry.quantity : Number(entry.quantity);
    let unitPriceCents = toCents(entry.rate);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    if (quantity < 0) {
      quantity = Math.abs(quantity);
      unitPriceCents = -unitPriceCents;
    }
    quantity = Math.round(quantity * 1000) / 1000;
    const name = text(entry.name, 200);
    const description = text(entry.description, 2000);
    const combined = description && name && !description.startsWith(name) ? `${name}\n${description}` : description || name;
    const zohoItem = text(entry.item_id, 80);
    lines.push({
      id: nid("lin"),
      itemId: zohoItem ? itemIds.get(zohoItem) ?? null : null,
      description: combined || "Ligne",
      quantity,
      unit: text(entry.unit, 20) || "unité",
      unitPriceCents,
      vatBps: toBps(entry.tax_percentage),
    });
  }
  if (lines.length > 0) return lines;
  const sub = toCents(raw.sub_total ?? raw.total);
  if (sub === 0) return lines;
  const tax = toCents(raw.tax_total);
  const vatBps = sub > 0 ? Math.min(10000, Math.max(0, Math.round((Math.abs(tax) * 10000) / Math.abs(sub)))) : 0;
  return [
    {
      id: nid("lin"),
      itemId: null,
      description: text(raw.notes, 200) || "Import Zoho",
      quantity: 1,
      unit: "forfait",
      unitPriceCents: sub,
      vatBps,
    },
  ];
}

function currencyOf(raw: Record<string, unknown>): string {
  const code = text(raw.currency_code, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function dateOf(value: unknown, fallback: string): string {
  const raw = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

function dateNotBefore(value: string, minimum: string): string {
  return value < minimum ? minimum : value;
}

function emailOf(value: unknown): string {
  const email = text(value, 160);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function nid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
