export const VAT_RATES = [
  { bps: 2000, label: "20 %" },
  { bps: 1000, label: "10 %" },
  { bps: 550, label: "5,5 %" },
  { bps: 210, label: "2,1 %" },
  { bps: 0, label: "0 %" },
] as const;

export type VatBps = (typeof VAT_RATES)[number]["bps"];

export const PAYMENT_METHODS = [
  { id: "transfer", label: "Virement" },
  { id: "card", label: "Carte" },
  { id: "check", label: "Chèque" },
  { id: "cash", label: "Espèces" },
  { id: "other", label: "Autre" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export const UNITS = ["unité", "heure", "jour", "forfait", "m²", "ml", "km"] as const;

export type QuoteStatus = "draft" | "sent" | "accepted" | "refused" | "invoiced";
export type InvoiceStatus = "draft" | "issued" | "void";
export type InvoiceViewStatus = "draft" | "issued" | "partial" | "overdue" | "paid" | "void";

export type Line = {
  id: string;
  itemId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  vatBps: number;
};

export type Customer = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  siret: string;
  vatNumber: string;
  notes: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Item = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  name: string;
  description: string;
  sku: string;
  unitPriceCents: number;
  unit: string;
  vatBps: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Quote = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  currencyCode: string;
  number: string;
  customerId: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  lines: Line[];
  notes: string;
  terms: string;
  invoiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Invoice = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  currencyCode: string;
  number: string;
  customerId: string;
  quoteId: string | null;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  lines: Line[];
  notes: string;
  terms: string;
  createdAt: string;
  updatedAt: string;
};

export type CreditNote = {
  id: string;
  number: string;
  customerId: string;
  invoiceId: string;
  issueDate: string;
  lines: Line[];
  reason: string;
  notes: string;
  createdAt: string;
};

export type Payment = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  currencyCode: string;
  number: string;
  invoiceId: string;
  customerId: string;
  amountCents: number;
  date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdAt: string;
};

export type Settings = {
  companyName: string;
  legalForm: string;
  tagline: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  siret: string;
  vatNumber: string;
  rcs: string;
  capital: string;
  iban: string;
  bic: string;
  defaultVatBps: number;
  paymentTermDays: number;
  quoteValidityDays: number;
  invoicePrefix: string;
  quotePrefix: string;
  creditPrefix: string;
  paymentPrefix: string;
  nextInvoice: number;
  nextQuote: number;
  nextCredit: number;
  nextPayment: number;
};

export type DataCenterId = "eu" | "com" | "in" | "com.au" | "jp" | "ca" | "sa" | "uk";

export type ZohoOrganization = {
  organizationId: string;
  name: string;
  currencyCode: string;
};

export type ImportTally = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
};

export type ImportReport = {
  customers: ImportTally;
  items: ImportTally;
  quotes: ImportTally;
  invoices: ImportTally;
  payments: ImportTally;
  taxes: ImportTally;
  currencies: ImportTally;
  errors: string[];
};

export type ZohoConnection = {
  dataCenter: DataCenterId;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  apiDomain: string;
  accountsServer: string;
  oauthState: string;
  organizationId: string;
  organizationName: string;
  organizations: ZohoOrganization[];
  connectedAt: string;
  lastImportAt: string;
  lastImport: ImportReport | null;
  lastError: string;
  ignoredIds: string[];
};

export type PublicZoho = {
  dataCenter: DataCenterId;
  clientId: string;
  hasClientSecret: boolean;
  connected: boolean;
  organizationId: string;
  organizationName: string;
  organizations: ZohoOrganization[];
  connectedAt: string;
  lastImportAt: string;
  lastImport: ImportReport | null;
  lastError: string;
};

export type Tax = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  name: string;
  rateBps: number;
  createdAt: string;
  updatedAt: string;
};

export type Currency = {
  id: string;
  zohoId: string | null;
  locallyEdited: boolean;
  code: string;
  name: string;
  symbol: string;
  isBase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Store = {
  version: 1;
  settings: Settings;
  customers: Customer[];
  items: Item[];
  quotes: Quote[];
  invoices: Invoice[];
  creditNotes: CreditNote[];
  payments: Payment[];
  taxes: Tax[];
  currencies: Currency[];
  zoho: ZohoConnection;
};

export type PublicStore = Omit<Store, "zoho"> & { zoho: PublicZoho };

export type Clock = {
  today: string;
  now: string;
};

export type LineInput = {
  itemId?: string | null;
  description?: string;
  quantity?: number;
  unit?: string;
  unitPriceCents?: number;
  vatBps?: number;
};
