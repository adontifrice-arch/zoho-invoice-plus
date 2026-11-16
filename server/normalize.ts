import type { Currency, Customer, DataCenterId, ImportReport, ImportTally, Invoice, Item, Payment, Quote, Store, Tax, ZohoOrganization } from "../shared/types.js";
import { emptyZoho, isDataCenter } from "../shared/zoho-public.js";

export function normalizeStore(value: unknown): Store {
  const raw = record(value);
  if (!raw || raw.version !== 1 || !record(raw.settings)) {
    throw new Error("invalid store");
  }
  return {
    version: 1,
    settings: raw.settings as Store["settings"],
    customers: rows(raw.customers, (row) => withOrigin(row) as Customer),
    items: rows(raw.items, (row) => withOrigin(row) as Item),
    quotes: rows(raw.quotes, (row) => withMoney(row) as Quote),
    invoices: rows(raw.invoices, (row) => withMoney(row) as Invoice),
    creditNotes: Array.isArray(raw.creditNotes) ? (raw.creditNotes as Store["creditNotes"]) : [],
    payments: rows(raw.payments, (row) => withMoney(row) as Payment),
    taxes: rows(raw.taxes, normalizeTax),
    currencies: rows(raw.currencies, normalizeCurrency),
    zoho: normalizeZoho(raw.zoho),
  };
}

function normalizeZoho(value: unknown): Store["zoho"] {
  const empty = emptyZoho();
  const raw = record(value);
  if (!raw) return empty;
  const dataCenter: DataCenterId = isDataCenter(raw.dataCenter) ? raw.dataCenter : "eu";
  return {
    ...empty,
    dataCenter,
    clientId: clip(raw.clientId, 200),
    clientSecret: clip(raw.clientSecret, 400),
    refreshToken: clip(raw.refreshToken, 4000),
    accessToken: clip(raw.accessToken, 4000),
    accessTokenExpiresAt: clip(raw.accessTokenExpiresAt, 40),
    apiDomain: clip(raw.apiDomain, 120),
    accountsServer: clip(raw.accountsServer, 120),
    oauthState: clip(raw.oauthState, 80),
    organizationId: clip(raw.organizationId, 40),
    organizationName: clip(raw.organizationName, 160),
    organizations: Array.isArray(raw.organizations) ? raw.organizations.flatMap(normalizeOrg) : [],
    connectedAt: clip(raw.connectedAt, 40),
    lastImportAt: clip(raw.lastImportAt, 40),
    lastImport: normalizeReport(raw.lastImport),
    lastError: clip(raw.lastError, 500),
    ignoredIds: Array.isArray(raw.ignoredIds) ? raw.ignoredIds.filter((id): id is string => typeof id === "string").slice(0, 5000) : [],
  };
}

function normalizeOrg(value: unknown): ZohoOrganization[] {
  const raw = record(value);
  if (!raw || typeof raw.organizationId !== "string" || !raw.organizationId) return [];
  return [
    {
      organizationId: raw.organizationId.slice(0, 40),
      name: typeof raw.name === "string" && raw.name ? raw.name.slice(0, 160) : "Organisation",
      currencyCode: typeof raw.currencyCode === "string" ? raw.currencyCode.slice(0, 8) : "EUR",
    },
  ];
}

function normalizeReport(value: unknown): ImportReport | null {
  const raw = record(value);
  if (!raw) return null;
  const keys = ["customers", "items", "quotes", "invoices", "payments", "taxes", "currencies"] as const;
  const report = {} as ImportReport;
  for (const key of keys) {
    const tally = tallyOf(raw[key]);
    if (!tally) return null;
    report[key] = tally;
  }
  report.errors = Array.isArray(raw.errors) ? raw.errors.filter((entry): entry is string => typeof entry === "string").slice(0, 30) : [];
  return report;
}

function tallyOf(value: unknown): ImportTally | null {
  const raw = record(value);
  if (!raw) return null;
  const created = numberOf(raw.created);
  const updated = numberOf(raw.updated);
  const unchanged = numberOf(raw.unchanged);
  const skipped = numberOf(raw.skipped);
  if (created == null || updated == null || unchanged == null || skipped == null) return null;
  return { created, updated, unchanged, skipped };
}

function normalizeTax(row: Record<string, unknown>): Tax | null {
  if (typeof row.id !== "string") return null;
  const rate = numberOf(row.rateBps) ?? 0;
  return {
    ...(withOrigin(row) as Tax),
    id: row.id,
    name: typeof row.name === "string" && row.name ? row.name : "Taxe",
    rateBps: Math.min(10000, Math.max(0, rate)),
  };
}

function normalizeCurrency(row: Record<string, unknown>): Currency | null {
  if (typeof row.id !== "string") return null;
  const code = typeof row.code === "string" ? row.code.toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(code)) return null;
  return {
    ...(withOrigin(row) as Currency),
    id: row.id,
    code,
    name: typeof row.name === "string" && row.name ? row.name : code,
    symbol: typeof row.symbol === "string" && row.symbol ? row.symbol : code,
    isBase: row.isBase === true,
  };
}

function withMoney<T extends Record<string, unknown>>(row: T): T & { zohoId: string | null; locallyEdited: boolean; currencyCode: string } {
  const code = typeof row.currencyCode === "string" ? row.currencyCode.toUpperCase() : "EUR";
  return { ...withOrigin(row), currencyCode: /^[A-Z]{3}$/.test(code) ? code : "EUR" };
}

function withOrigin<T extends Record<string, unknown>>(row: T): T & { zohoId: string | null; locallyEdited: boolean } {
  return {
    ...row,
    zohoId: typeof row.zohoId === "string" && row.zohoId ? row.zohoId : null,
    locallyEdited: row.locallyEdited === true,
  };
}

function rows<T>(value: unknown, map: (row: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = record(entry);
    if (!row || typeof row.id !== "string") return [];
    const mapped = map(row);
    return mapped ? [mapped] : [];
  });
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function numberOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
