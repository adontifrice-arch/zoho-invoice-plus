import { isVatBps, addDays, defaultInvoiceTerms, defaultQuoteTerms, documentTotals, invoiceBalance } from "../shared/money.js";
import { ignoreZohoId } from "../shared/zoho-import.js";
import { PAYMENT_METHODS } from "../shared/types.js";
import type {
  Clock,
  CreditNote,
  Customer,
  CustomerContact,
  Invoice,
  Item,
  Line,
  LineInput,
  MailContact,
  Payment,
  PaymentMethod,
  Quote,
  QuoteStatus,
  Settings,
  Store,
} from "../shared/types.js";

export class AppError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export type CustomerInput = {
  name?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  postalCode?: unknown;
  city?: unknown;
  country?: unknown;
  siret?: unknown;
  vatNumber?: unknown;
  notes?: unknown;
  contacts?: unknown;
  archived?: unknown;
};

export type ItemInput = {
  name?: unknown;
  description?: unknown;
  sku?: unknown;
  unitPriceCents?: unknown;
  unit?: unknown;
  vatBps?: unknown;
  active?: unknown;
};

export type DocumentInput = {
  customerId?: unknown;
  issueDate?: unknown;
  validUntil?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  terms?: unknown;
  lines?: unknown;
};

export type CreditInput = {
  issueDate?: unknown;
  reason?: unknown;
  notes?: unknown;
  lines?: unknown;
};

export type PaymentInput = {
  amountCents?: unknown;
  date?: unknown;
  method?: unknown;
  reference?: unknown;
  notes?: unknown;
};

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new AppError(message, 404);
  return value;
}

function asString(value: unknown, label: string): string {
  if (value == null) return "";
  if (typeof value !== "string") throw new AppError(`${label} est invalide.`);
  return value;
}

function clip(value: unknown, max: number, label: string): string {
  const trimmed = asString(value, label).trim();
  if (trimmed.length > max) throw new AppError(`${label} est trop long.`);
  return trimmed;
}

function assertDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${label} est invalide.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new AppError(`${label} est invalide.`);
  }
  return value;
}

function assertEmail(value: string): string {
  if (!value) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new AppError("L'adresse e-mail est invalide.");
  return value;
}

function integerIn(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new AppError(`${label} est invalide.`);
  }
  return value;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function normalizeLines(input: unknown, store: Store): Line[] {
  if (!Array.isArray(input) || input.length === 0) throw new AppError("Ajoutez au moins une ligne.");
  if (input.length > 80) throw new AppError("Une pièce ne peut pas dépasser 80 lignes.");
  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw new AppError("Une ligne est invalide.");
    const row = raw as LineInput;
    const description = clip(row.description, 2000, "La description");
    if (!description) throw new AppError("Chaque ligne doit avoir une description.");
    if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity)) {
      throw new AppError("La quantité est invalide.");
    }
    const quantity = Math.round(row.quantity * 100) / 100;
    if (quantity <= 0 || quantity > 100_000) throw new AppError("La quantité est invalide.");
    const unit = clip(row.unit, 20, "L'unité");
    if (!unit) throw new AppError("Chaque ligne doit avoir une unité.");
    if (
      typeof row.unitPriceCents !== "number" ||
      !Number.isInteger(row.unitPriceCents) ||
      row.unitPriceCents < 0 ||
      row.unitPriceCents > 1_000_000_000
    ) {
      throw new AppError("Le prix unitaire est invalide.");
    }
    if (typeof row.vatBps !== "number" || !isVatBps(row.vatBps)) throw new AppError("Le taux de TVA est invalide.");
    let itemId: string | null = null;
    if (row.itemId != null && row.itemId !== "") {
      if (typeof row.itemId !== "string" || !store.items.some((item) => item.id === row.itemId)) {
        throw new AppError("Un article de la ligne est introuvable.");
      }
      itemId = row.itemId;
    }
    return {
      id: newId("lin"),
      itemId,
      description,
      quantity,
      unit,
      unitPriceCents: row.unitPriceCents,
      vatBps: row.vatBps,
    };
  });
}

function requireCustomer(store: Store, customerId: unknown, allowArchived: boolean): Customer {
  if (typeof customerId !== "string" || !customerId) throw new AppError("Choisissez un client.");
  const customer = store.customers.find((entry) => entry.id === customerId);
  if (!customer) throw new AppError("Client introuvable.", 404);
  if (customer.archived && !allowArchived) throw new AppError("Ce client est archivé.");
  return customer;
}

function formatNumber(prefix: string, date: string, sequence: number): string {
  return `${prefix}-${date.slice(0, 4)}-${String(sequence).padStart(3, "0")}`;
}

function allocate(store: Store, kind: "invoice" | "quote" | "credit" | "payment", date: string): {
  settings: Settings;
  number: string;
} {
  const settings: Settings = { ...store.settings };
  const prefixKey = {
    invoice: "invoicePrefix",
    quote: "quotePrefix",
    credit: "creditPrefix",
    payment: "paymentPrefix",
  } as const;
  const nextKey = {
    invoice: "nextInvoice",
    quote: "nextQuote",
    credit: "nextCredit",
    payment: "nextPayment",
  } as const;
  const taken = new Set<string>();
  for (const invoice of store.invoices) if (invoice.number) taken.add(invoice.number);
  for (const quote of store.quotes) if (quote.number) taken.add(quote.number);
  for (const note of store.creditNotes) taken.add(note.number);
  for (const payment of store.payments) taken.add(payment.number);
  let sequence = settings[nextKey[kind]];
  if (!Number.isInteger(sequence) || sequence < 1) sequence = 1;
  let number = formatNumber(settings[prefixKey[kind]], date, sequence);
  while (taken.has(number)) {
    sequence += 1;
    number = formatNumber(settings[prefixKey[kind]], date, sequence);
  }
  settings[nextKey[kind]] = sequence + 1;
  return { settings, number };
}

function parseContacts(input: unknown, fallbackEmail: string, fallbackName: string): CustomerContact[] {
  if (input === undefined) {
    if (!fallbackEmail) return [];
    return [
      {
        id: newId("ctc"),
        name: fallbackName,
        email: assertEmail(fallbackEmail),
        role: "",
        isPrimary: true,
      },
    ];
  }
  if (!Array.isArray(input)) throw new AppError("La liste de contacts est invalide.");
  if (input.length > 40) throw new AppError("Un client ne peut pas avoir plus de 40 contacts.");
  const contacts: CustomerContact[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") throw new AppError("Un contact est invalide.");
    const row = raw as Record<string, unknown>;
    const email = assertEmail(clip(row.email, 160, "L'e-mail du contact"));
    if (!email) continue;
    if (seen.has(email.toLowerCase())) throw new AppError("Deux contacts partagent la même adresse e-mail.");
    seen.add(email.toLowerCase());
    contacts.push({
      id: typeof row.id === "string" && row.id.trim() ? clip(row.id, 40, "L'identifiant du contact") : newId("ctc"),
      name: clip(row.name, 160, "Le nom du contact"),
      email,
      role: clip(row.role, 80, "Le rôle du contact"),
      isPrimary: row.isPrimary === true,
    });
  }
  if (contacts.length === 0 && fallbackEmail) {
    contacts.push({
      id: newId("ctc"),
      name: fallbackName,
      email: assertEmail(fallbackEmail),
      role: "",
      isPrimary: true,
    });
  }
  if (contacts.length === 0) return [];
  if (!contacts.some((entry) => entry.isPrimary)) contacts[0].isPrimary = true;
  let primarySeen = false;
  return contacts.map((entry) => {
    if (!entry.isPrimary) return entry;
    if (primarySeen) return { ...entry, isPrimary: false };
    primarySeen = true;
    return entry;
  });
}

function parseMailContacts(input: unknown, previous: MailContact[]): MailContact[] {
  if (input === undefined) return previous;
  if (!Array.isArray(input)) throw new AppError("Les contacts génériques sont invalides.");
  if (input.length > 40) throw new AppError("Quarante contacts génériques au maximum.");
  const contacts: MailContact[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") throw new AppError("Un contact générique est invalide.");
    const row = raw as Record<string, unknown>;
    const email = assertEmail(clip(row.email, 160, "L'e-mail du contact générique"));
    if (!email) continue;
    if (seen.has(email.toLowerCase())) throw new AppError("Deux contacts génériques partagent la même adresse e-mail.");
    seen.add(email.toLowerCase());
    contacts.push({
      id: typeof row.id === "string" && row.id.trim() ? clip(row.id, 40, "L'identifiant du contact") : newId("mail"),
      name: clip(row.name, 160, "Le nom du contact générique"),
      email,
    });
  }
  return contacts;
}

function customerFrom(input: CustomerInput, previous?: Customer): Omit<Customer, "id" | "createdAt" | "updatedAt" | "zohoId" | "locallyEdited"> {
  const name = clip(input.name, 160, "Le nom");
  const company = clip(input.company, 160, "La société");
  if (!name && !company) throw new AppError("Indiquez un nom ou une société.");
  const country = clip(input.country, 80, "Le pays") || "France";
  const contacts = parseContacts(input.contacts, clip(input.email, 160, "L'e-mail"), name);
  const primary = contacts.find((entry) => entry.isPrimary) ?? contacts[0];
  return {
    name,
    company,
    email: primary?.email || assertEmail(clip(input.email, 160, "L'e-mail")),
    phone: clip(input.phone, 40, "Le téléphone"),
    address: clip(input.address, 240, "L'adresse"),
    postalCode: clip(input.postalCode, 16, "Le code postal"),
    city: clip(input.city, 80, "La ville"),
    country,
    siret: clip(input.siret, 40, "Le SIRET"),
    vatNumber: clip(input.vatNumber, 40, "Le numéro de TVA"),
    notes: clip(input.notes, 4000, "Les notes"),
    contacts,
    archived: typeof input.archived === "boolean" ? input.archived : (previous?.archived ?? false),
  };
}

export function createCustomer(store: Store, input: CustomerInput, clock: Clock): { store: Store; customer: Customer } {
  const customer: Customer = {
    id: newId("cus"),
    zohoId: null,
    locallyEdited: false,
    ...customerFrom(input),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  return { store: { ...store, customers: [...store.customers, customer] }, customer };
}

export function updateCustomer(
  store: Store,
  customerId: string,
  input: CustomerInput,
  clock: Clock,
): { store: Store; customer: Customer } {
  const current = must(store.customers.find((entry) => entry.id === customerId), "Client introuvable.");
  const customer: Customer = { ...current, ...customerFrom(input, current), locallyEdited: true, updatedAt: clock.now };
  return {
    store: { ...store, customers: store.customers.map((entry) => (entry.id === customerId ? customer : entry)) },
    customer,
  };
}

export function removeCustomer(store: Store, customerId: string, clock: Clock): {
  store: Store;
  deleted: boolean;
  archived: boolean;
} {
  const current = must(store.customers.find((entry) => entry.id === customerId), "Client introuvable.");
  const used =
    store.quotes.some((quote) => quote.customerId === customerId) ||
    store.invoices.some((invoice) => invoice.customerId === customerId) ||
    store.creditNotes.some((note) => note.customerId === customerId) ||
    store.payments.some((payment) => payment.customerId === customerId);
  if (used) {
    const customer = { ...current, archived: true, locallyEdited: true, updatedAt: clock.now };
    return {
      store: { ...store, customers: store.customers.map((entry) => (entry.id === customerId ? customer : entry)) },
      deleted: false,
      archived: true,
    };
  }
  const next = ignoreZohoId(store, current.zohoId);
  return {
    store: { ...next, customers: next.customers.filter((entry) => entry.id !== customerId) },
    deleted: true,
    archived: false,
  };
}

function itemFrom(input: ItemInput, previous?: Item): Omit<Item, "id" | "createdAt" | "updatedAt" | "zohoId" | "locallyEdited"> {
  const name = clip(input.name, 160, "Le nom");
  if (!name) throw new AppError("L'article doit avoir un nom.");
  const unit = clip(input.unit, 20, "L'unité");
  if (!unit) throw new AppError("Indiquez une unité.");
  if (
    typeof input.unitPriceCents !== "number" ||
    !Number.isInteger(input.unitPriceCents) ||
    input.unitPriceCents < 0 ||
    input.unitPriceCents > 1_000_000_000
  ) {
    throw new AppError("Le prix unitaire est invalide.");
  }
  if (typeof input.vatBps !== "number" || !isVatBps(input.vatBps)) throw new AppError("Le taux de TVA est invalide.");
  return {
    name,
    description: clip(input.description, 2000, "La description"),
    sku: clip(input.sku, 40, "La référence").toUpperCase(),
    unitPriceCents: input.unitPriceCents,
    unit,
    vatBps: input.vatBps,
    active: typeof input.active === "boolean" ? input.active : (previous?.active ?? true),
  };
}

export function createItem(store: Store, input: ItemInput, clock: Clock): { store: Store; item: Item } {
  const item: Item = { id: newId("item"), zohoId: null, locallyEdited: false, ...itemFrom(input), createdAt: clock.now, updatedAt: clock.now };
  return { store: { ...store, items: [...store.items, item] }, item };
}

export function updateItem(store: Store, itemId: string, input: ItemInput, clock: Clock): { store: Store; item: Item } {
  const current = must(store.items.find((entry) => entry.id === itemId), "Article introuvable.");
  const item: Item = { ...current, ...itemFrom(input, current), locallyEdited: true, updatedAt: clock.now };
  return { store: { ...store, items: store.items.map((entry) => (entry.id === itemId ? item : entry)) }, item };
}

export function removeItem(store: Store, itemId: string, clock: Clock): { store: Store; deleted: boolean; archived: boolean } {
  const current = must(store.items.find((entry) => entry.id === itemId), "Article introuvable.");
  const used = [...store.quotes, ...store.invoices, ...store.creditNotes].some((doc) =>
    doc.lines.some((line) => line.itemId === itemId),
  );
  if (used) {
    const item = { ...current, active: false, locallyEdited: true, updatedAt: clock.now };
    return {
      store: { ...store, items: store.items.map((entry) => (entry.id === itemId ? item : entry)) },
      deleted: false,
      archived: true,
    };
  }
  const next = ignoreZohoId(store, current.zohoId);
  return {
    store: { ...next, items: next.items.filter((entry) => entry.id !== itemId) },
    deleted: true,
    archived: false,
  };
}

function copyLines(lines: Line[]): Line[] {
  return lines.map((line) => ({ ...line, id: newId("lin") }));
}

export function createQuote(store: Store, input: DocumentInput, clock: Clock): { store: Store; quote: Quote } {
  const customer = requireCustomer(store, input.customerId, false);
  const issueDate = assertDate(input.issueDate, "La date du devis");
  const validUntil = assertDate(input.validUntil, "La date de validité");
  if (validUntil < issueDate) throw new AppError("La validité ne peut pas précéder la date du devis.");
  const lines = normalizeLines(input.lines, store);
  const { settings, number } = allocate(store, "quote", issueDate);
  const quote: Quote = {
    id: newId("quo"),
    zohoId: null,
    locallyEdited: false,
    currencyCode: "EUR",
    number,
    customerId: customer.id,
    status: "draft",
    issueDate,
    validUntil,
    lines,
    notes: clip(input.notes, 4000, "Les notes"),
    terms: clip(input.terms, 4000, "Les conditions") || defaultQuoteTerms(store.settings.quoteValidityDays),
    invoiceId: null,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  return { store: { ...store, settings, quotes: [...store.quotes, quote] }, quote };
}

function quoteMutable(store: Store, quote: Quote): void {
  if (quote.status === "invoiced" || quote.status === "refused") {
    throw new AppError("Ce devis n'est plus modifiable.");
  }
  if (quote.invoiceId) {
    const invoice = store.invoices.find((entry) => entry.id === quote.invoiceId);
    if (invoice && invoice.status !== "void") {
      throw new AppError("Une facture est déjà liée à ce devis.");
    }
  }
}

export function updateQuote(store: Store, quoteId: string, input: DocumentInput, clock: Clock): { store: Store; quote: Quote } {
  const current = must(store.quotes.find((entry) => entry.id === quoteId), "Devis introuvable.");
  quoteMutable(store, current);
  const customer = requireCustomer(store, input.customerId, true);
  const issueDate = assertDate(input.issueDate, "La date du devis");
  const validUntil = assertDate(input.validUntil, "La date de validité");
  if (validUntil < issueDate) throw new AppError("La validité ne peut pas précéder la date du devis.");
  const quote: Quote = {
    ...current,
    customerId: customer.id,
    issueDate,
    validUntil,
    lines: normalizeLines(input.lines, store),
    notes: clip(input.notes, 4000, "Les notes"),
    terms: clip(input.terms, 4000, "Les conditions"),
    locallyEdited: true,
    updatedAt: clock.now,
  };
  return { store: { ...store, quotes: store.quotes.map((entry) => (entry.id === quoteId ? quote : entry)) }, quote };
}

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["draft", "accepted", "refused"],
  accepted: ["sent", "refused"],
  refused: ["sent"],
  invoiced: [],
};

export function setQuoteStatus(
  store: Store,
  quoteId: string,
  status: unknown,
  clock: Clock,
): { store: Store; quote: Quote } {
  const current = must(store.quotes.find((entry) => entry.id === quoteId), "Devis introuvable.");
  if (status !== "draft" && status !== "sent" && status !== "accepted" && status !== "refused") {
    throw new AppError("Statut de devis invalide.");
  }
  if (!QUOTE_TRANSITIONS[current.status].includes(status)) {
    throw new AppError("Ce changement de statut n'est pas possible.");
  }
  if ((status === "draft" || status === "refused") && current.invoiceId) {
    const invoice = store.invoices.find((entry) => entry.id === current.invoiceId);
    if (invoice && invoice.status !== "void") {
      throw new AppError("Supprimez la facture brouillon liée avant de modifier ce statut.");
    }
  }
  const quote: Quote = { ...current, status, locallyEdited: true, updatedAt: clock.now };
  return { store: { ...store, quotes: store.quotes.map((entry) => (entry.id === quoteId ? quote : entry)) }, quote };
}

export function deleteQuote(store: Store, quoteId: string): Store {
  const quote = must(store.quotes.find((entry) => entry.id === quoteId), "Devis introuvable.");
  if (quote.status !== "draft") throw new AppError("Seul un devis brouillon peut être supprimé.");
  if (quote.invoiceId) throw new AppError("Ce devis est lié à une facture.");
  const next = ignoreZohoId(store, quote.zohoId);
  return { ...next, quotes: next.quotes.filter((entry) => entry.id !== quoteId) };
}

export function convertQuote(store: Store, quoteId: string, clock: Clock): { store: Store; invoice: Invoice } {
  const quote = must(store.quotes.find((entry) => entry.id === quoteId), "Devis introuvable.");
  if (quote.status !== "sent" && quote.status !== "accepted") {
    throw new AppError("Seuls un devis envoyé ou accepté peut être converti en facture.");
  }
  if (quote.invoiceId) {
    const existing = store.invoices.find((entry) => entry.id === quote.invoiceId);
    if (existing && existing.status !== "void") throw new AppError("Ce devis est déjà lié à une facture.");
  }
  requireCustomer(store, quote.customerId, true);
  const invoice: Invoice = {
    id: newId("inv"),
    zohoId: null,
    locallyEdited: false,
    currencyCode: quote.currencyCode || "EUR",
    number: "",
    customerId: quote.customerId,
    quoteId: quote.id,
    status: "draft",
    issueDate: clock.today,
    dueDate: addDays(clock.today, store.settings.paymentTermDays),
    lines: copyLines(quote.lines),
    notes: quote.notes,
    terms: defaultInvoiceTerms(store.settings.paymentTermDays),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  const nextQuote: Quote = { ...quote, status: "accepted", invoiceId: invoice.id, locallyEdited: true, updatedAt: clock.now };
  return {
    store: {
      ...store,
      quotes: store.quotes.map((entry) => (entry.id === quote.id ? nextQuote : entry)),
      invoices: [...store.invoices, invoice],
    },
    invoice,
  };
}

export function duplicateQuote(store: Store, quoteId: string, clock: Clock): { store: Store; quote: Quote } {
  const quote = must(store.quotes.find((entry) => entry.id === quoteId), "Devis introuvable.");
  const issueDate = clock.today;
  const { settings, number } = allocate(store, "quote", issueDate);
  const copy: Quote = {
    ...quote,
    id: newId("quo"),
    zohoId: null,
    locallyEdited: false,
    number,
    status: "draft",
    issueDate,
    validUntil: addDays(issueDate, store.settings.quoteValidityDays),
    lines: copyLines(quote.lines),
    invoiceId: null,
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  return { store: { ...store, settings, quotes: [...store.quotes, copy] }, quote: copy };
}

export function createInvoice(store: Store, input: DocumentInput, clock: Clock): { store: Store; invoice: Invoice } {
  const customer = requireCustomer(store, input.customerId, false);
  const issueDate = assertDate(input.issueDate, "La date de facture");
  const dueDate = assertDate(input.dueDate, "La date d'échéance");
  if (dueDate < issueDate) throw new AppError("L'échéance ne peut pas précéder la date de facture.");
  const invoice: Invoice = {
    id: newId("inv"),
    zohoId: null,
    locallyEdited: false,
    currencyCode: "EUR",
    number: "",
    customerId: customer.id,
    quoteId: null,
    status: "draft",
    issueDate,
    dueDate,
    lines: normalizeLines(input.lines, store),
    notes: clip(input.notes, 4000, "Les notes"),
    terms: clip(input.terms, 4000, "Les conditions") || defaultInvoiceTerms(store.settings.paymentTermDays),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  return { store: { ...store, invoices: [...store.invoices, invoice] }, invoice };
}

export function updateInvoice(
  store: Store,
  invoiceId: string,
  input: DocumentInput,
  clock: Clock,
): { store: Store; invoice: Invoice } {
  const current = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (current.status !== "draft") throw new AppError("Seule une facture brouillon peut être modifiée.");
  const customer = requireCustomer(store, input.customerId, true);
  const issueDate = assertDate(input.issueDate, "La date de facture");
  const dueDate = assertDate(input.dueDate, "La date d'échéance");
  if (dueDate < issueDate) throw new AppError("L'échéance ne peut pas précéder la date de facture.");
  const invoice: Invoice = {
    ...current,
    customerId: customer.id,
    issueDate,
    dueDate,
    lines: normalizeLines(input.lines, store),
    notes: clip(input.notes, 4000, "Les notes"),
    terms: clip(input.terms, 4000, "Les conditions"),
    locallyEdited: true,
    updatedAt: clock.now,
  };
  return {
    store: { ...store, invoices: store.invoices.map((entry) => (entry.id === invoiceId ? invoice : entry)) },
    invoice,
  };
}

export function issueInvoice(store: Store, invoiceId: string, clock: Clock): { store: Store; invoice: Invoice } {
  const current = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (current.status !== "draft") throw new AppError("Seule une facture brouillon peut être émise.");
  if (current.lines.length === 0) throw new AppError("Ajoutez au moins une ligne.");
  requireCustomer(store, current.customerId, true);
  let settings = store.settings;
  let number = current.number.trim();
  if (!number) {
    const allocated = allocate(store, "invoice", current.issueDate);
    settings = allocated.settings;
    number = allocated.number;
  }
  const invoice: Invoice = { ...current, status: "issued", number, locallyEdited: true, updatedAt: clock.now };
  const quotes = store.quotes.map((quote) =>
    quote.id === invoice.quoteId
      ? { ...quote, status: "invoiced" as const, invoiceId: invoice.id, locallyEdited: true, updatedAt: clock.now }
      : quote,
  );
  return {
    store: {
      ...store,
      settings,
      quotes,
      invoices: store.invoices.map((entry) => (entry.id === invoiceId ? invoice : entry)),
    },
    invoice,
  };
}

export function voidInvoice(store: Store, invoiceId: string, clock: Clock): { store: Store; invoice: Invoice } {
  const current = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (current.status !== "issued") throw new AppError("Seule une facture émise peut être annulée.");
  if (store.payments.some((payment) => payment.invoiceId === current.id)) {
    throw new AppError("Supprimez les paiements avant d'annuler la facture.");
  }
  if (store.creditNotes.some((note) => note.invoiceId === current.id)) {
    throw new AppError("Supprimez les avoirs avant d'annuler la facture.");
  }
  const invoice: Invoice = { ...current, status: "void", locallyEdited: true, updatedAt: clock.now };
  const quotes = store.quotes.map((quote) => {
    if (quote.id !== current.quoteId && quote.invoiceId !== current.id) return quote;
    return { ...quote, status: "accepted" as const, invoiceId: null, locallyEdited: true, updatedAt: clock.now };
  });
  return {
    store: {
      ...store,
      quotes,
      invoices: store.invoices.map((entry) => (entry.id === invoiceId ? invoice : entry)),
    },
    invoice,
  };
}

export function deleteInvoice(store: Store, invoiceId: string, clock: Clock): Store {
  const invoice = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (invoice.status !== "draft") throw new AppError("Seule une facture brouillon peut être supprimée.");
  const next = ignoreZohoId(store, invoice.zohoId);
  const quotes = next.quotes.map((quote) =>
    quote.invoiceId === invoice.id ? { ...quote, invoiceId: null, locallyEdited: true, updatedAt: clock.now } : quote,
  );
  return { ...next, quotes, invoices: next.invoices.filter((entry) => entry.id !== invoiceId) };
}

export function duplicateInvoice(store: Store, invoiceId: string, clock: Clock): { store: Store; invoice: Invoice } {
  const invoice = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  const issueDate = clock.today;
  const copy: Invoice = {
    ...invoice,
    id: newId("inv"),
    zohoId: null,
    locallyEdited: false,
    number: "",
    quoteId: null,
    status: "draft",
    issueDate,
    dueDate: addDays(issueDate, store.settings.paymentTermDays),
    lines: copyLines(invoice.lines),
    createdAt: clock.now,
    updatedAt: clock.now,
  };
  return { store: { ...store, invoices: [...store.invoices, copy] }, invoice: copy };
}

export function createCreditNote(
  store: Store,
  invoiceId: string,
  input: CreditInput,
  clock: Clock,
): { store: Store; creditNote: CreditNote } {
  const invoice = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (invoice.status !== "issued") throw new AppError("Un avoir se crée sur une facture émise.");
  const issueDate = assertDate(input.issueDate ?? clock.today, "La date de l'avoir");
  const lines = normalizeLines(input.lines, store);
  const amount = documentTotals(lines).ttc;
  if (amount <= 0) throw new AppError("L'avoir doit avoir un montant.");
  const already = store.creditNotes
    .filter((note) => note.invoiceId === invoice.id)
    .reduce((sum, note) => sum + documentTotals(note.lines).ttc, 0);
  const invoiceTtc = documentTotals(invoice.lines).ttc;
  if (already + amount > invoiceTtc) throw new AppError("L'avoir dépasse le montant restant de la facture.");
  const { settings, number } = allocate(store, "credit", issueDate);
  const creditNote: CreditNote = {
    id: newId("av"),
    number,
    customerId: invoice.customerId,
    invoiceId: invoice.id,
    issueDate,
    lines,
    reason: clip(input.reason, 500, "Le motif"),
    notes: clip(input.notes, 4000, "Les notes"),
    createdAt: clock.now,
  };
  const stored = { ...store, settings, creditNotes: [...store.creditNotes, creditNote] };
  return { store: markInvoiceEdited(stored, invoice.id), creditNote };
}

export function deleteCreditNote(store: Store, creditNoteId: string): Store {
  const note = must(store.creditNotes.find((entry) => entry.id === creditNoteId), "Avoir introuvable.");
  const stored = { ...store, creditNotes: store.creditNotes.filter((entry) => entry.id !== note.id) };
  return markInvoiceEdited(stored, note.invoiceId);
}

export function createPayment(
  store: Store,
  invoiceId: string,
  input: PaymentInput,
  clock: Clock,
): { store: Store; payment: Payment } {
  const invoice = must(store.invoices.find((entry) => entry.id === invoiceId), "Facture introuvable.");
  if (invoice.status !== "issued") throw new AppError("Un paiement s'enregistre sur une facture émise.");
  if (typeof input.amountCents !== "number" || !Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("Le montant du paiement est invalide.");
  }
  const balance = invoiceBalance(invoice, store.creditNotes, store.payments);
  if (input.amountCents > balance.due) throw new AppError("Le montant dépasse le reste à payer.");
  const date = assertDate(input.date ?? clock.today, "La date du paiement");
  if (!PAYMENT_METHODS.some((method) => method.id === input.method)) throw new AppError("Le mode de paiement est invalide.");
  const method = input.method as PaymentMethod;
  const { settings, number } = allocate(store, "payment", date);
  const payment: Payment = {
    id: newId("pay"),
    zohoId: null,
    locallyEdited: false,
    currencyCode: invoice.currencyCode || "EUR",
    number,
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    amountCents: input.amountCents,
    date,
    method,
    reference: clip(input.reference, 140, "La référence"),
    notes: clip(input.notes, 2000, "Les notes"),
    createdAt: clock.now,
  };
  const stored = { ...store, settings, payments: [...store.payments, payment] };
  return { store: markInvoiceEdited(stored, invoice.id), payment };
}

function keptFromZoho<T extends { zohoId: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.zohoId);
}

export function removeDemoRecords(store: Store): {
  store: Store;
  removed: { customers: number; items: number; quotes: number; invoices: number; creditNotes: number; payments: number };
} {
  const invoices = keptFromZoho(store.invoices);
  const removedInvoiceIds = new Set(store.invoices.filter((row) => !row.zohoId).map((row) => row.id));
  const quotes = keptFromZoho(store.quotes);
  const quoteIds = new Set(quotes.map((row) => row.id));
  const next: Store = {
    ...store,
    customers: keptFromZoho(store.customers),
    items: keptFromZoho(store.items),
    quotes,
    invoices: invoices.map((invoice) =>
      invoice.quoteId && !quoteIds.has(invoice.quoteId) ? { ...invoice, quoteId: null } : invoice,
    ),
    creditNotes: store.creditNotes.filter((note) => !removedInvoiceIds.has(note.invoiceId)),
    payments: keptFromZoho(store.payments),
    taxes: keptFromZoho(store.taxes),
    currencies: keptFromZoho(store.currencies),
  };
  return {
    store: next,
    removed: {
      customers: store.customers.length - next.customers.length,
      items: store.items.length - next.items.length,
      quotes: store.quotes.length - next.quotes.length,
      invoices: store.invoices.length - next.invoices.length,
      creditNotes: store.creditNotes.length - next.creditNotes.length,
      payments: store.payments.length - next.payments.length,
    },
  };
}

export function deletePayment(store: Store, paymentId: string): Store {
  const payment = must(store.payments.find((entry) => entry.id === paymentId), "Paiement introuvable.");
  const next = ignoreZohoId(store, payment.zohoId);
  const stored = { ...next, payments: next.payments.filter((entry) => entry.id !== payment.id) };
  return markInvoiceEdited(stored, payment.invoiceId);
}

function markInvoiceEdited(store: Store, invoiceId: string): Store {
  return {
    ...store,
    invoices: store.invoices.map((invoice) => (invoice.id === invoiceId ? { ...invoice, locallyEdited: true } : invoice)),
  };
}

function prefixOf(value: unknown, fallback: string): string {
  const raw = clip(value ?? fallback, 8, "Le préfixe").toUpperCase();
  if (!/^[A-Z0-9]{1,8}$/.test(raw)) throw new AppError("Un préfixe contient 1 à 8 lettres ou chiffres.");
  return raw;
}

export function updateSettings(store: Store, input: Partial<Record<keyof Settings, unknown>>): Store {
  const current = store.settings;
  const companyName = clip(input.companyName ?? current.companyName, 160, "La raison sociale");
  if (!companyName) throw new AppError("La raison sociale est obligatoire.");
  const defaultVatBps = input.defaultVatBps ?? current.defaultVatBps;
  if (typeof defaultVatBps !== "number" || !isVatBps(defaultVatBps)) throw new AppError("La TVA par défaut est invalide.");
  const settings: Settings = {
    ...current,
    companyName,
    legalForm: clip(input.legalForm ?? current.legalForm, 80, "La forme juridique"),
    tagline: clip(input.tagline ?? current.tagline, 120, "L'activité"),
    address: clip(input.address ?? current.address, 240, "L'adresse"),
    postalCode: clip(input.postalCode ?? current.postalCode, 16, "Le code postal"),
    city: clip(input.city ?? current.city, 80, "La ville"),
    country: clip(input.country ?? current.country, 80, "Le pays") || "France",
    email: assertEmail(clip(input.email ?? current.email, 160, "L'e-mail")),
    phone: clip(input.phone ?? current.phone, 40, "Le téléphone"),
    website: clip(input.website ?? current.website, 160, "Le site web"),
    siret: clip(input.siret ?? current.siret, 40, "Le SIRET"),
    vatNumber: clip(input.vatNumber ?? current.vatNumber, 40, "Le numéro de TVA"),
    rcs: clip(input.rcs ?? current.rcs, 80, "Le RCS"),
    capital: clip(input.capital ?? current.capital, 40, "Le capital"),
    iban: clip(input.iban ?? current.iban, 42, "L'IBAN"),
    bic: clip(input.bic ?? current.bic, 16, "Le BIC"),
    defaultVatBps,
    paymentTermDays: integerIn(input.paymentTermDays ?? current.paymentTermDays, 0, 365, "Le délai de paiement"),
    quoteValidityDays: integerIn(input.quoteValidityDays ?? current.quoteValidityDays, 1, 365, "La validité du devis"),
    invoicePrefix: prefixOf(input.invoicePrefix, current.invoicePrefix),
    quotePrefix: prefixOf(input.quotePrefix, current.quotePrefix),
    creditPrefix: prefixOf(input.creditPrefix, current.creditPrefix),
    paymentPrefix: prefixOf(input.paymentPrefix, current.paymentPrefix),
    mailContacts: parseMailContacts(input.mailContacts, current.mailContacts ?? []),
  };
  return { ...store, settings };
}
