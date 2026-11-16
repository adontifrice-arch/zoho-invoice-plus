import { randomBytes } from "node:crypto";
import { AppError } from "./logic.js";
import { applyZohoImport, type ZohoBundle } from "../shared/zoho-import.js";
import { allowedAccountsUrl, allowedApiUrl, dataCenterOf, emptyZoho, isDataCenter, REDIRECT_URI, ZOHO_SCOPES } from "../shared/zoho-public.js";
import type { Clock, DataCenterId, Store, ZohoConnection, ZohoOrganization } from "../shared/types.js";

const LOCATION: Record<string, DataCenterId> = {
  eu: "eu",
  us: "com",
  in: "in",
  au: "com.au",
  jp: "jp",
  ca: "ca",
  sa: "sa",
  uk: "uk",
};

export function buildAuthorizeUrl(zoho: ZohoConnection, state: string): string {
  const url = new URL("/oauth/v2/auth", dataCenterOf(zoho.dataCenter).accounts);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", zoho.clientId);
  url.searchParams.set("scope", ZOHO_SCOPES);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export function saveZohoConfig(store: Store, input: unknown): Store {
  const body = record(input);
  if (!body || !isDataCenter(body.dataCenter)) throw new AppError("Choisissez le centre de données Zoho.");
  const clientId = clip(body.clientId, 120);
  if (!clientId || /\s/.test(clientId)) throw new AppError("L'identifiant client Zoho est invalide.");
  const provided = clip(body.clientSecret, 400);
  const clientSecret = provided || store.zoho.clientSecret;
  if (!clientSecret) throw new AppError("Indiquez le secret du client Zoho. Il reste enregistré sur cette machine.");
  const changed = clientId !== store.zoho.clientId || body.dataCenter !== store.zoho.dataCenter;
  return {
    ...store,
    zoho: {
      ...store.zoho,
      ...(changed
        ? {
            refreshToken: "",
            accessToken: "",
            accessTokenExpiresAt: "",
            apiDomain: "",
            accountsServer: "",
            oauthState: "",
            organizationId: "",
            organizationName: "",
            organizations: [],
            connectedAt: "",
          }
        : {}),
      dataCenter: body.dataCenter,
      clientId,
      clientSecret,
      lastError: "",
    },
  };
}

export function beginOAuth(store: Store): { store: Store; url: string } {
  if (!store.zoho.clientId || !store.zoho.clientSecret) {
    throw new AppError("Enregistrez d'abord l'identifiant et le secret Zoho.");
  }
  const state = randomBytes(24).toString("hex");
  return {
    store: { ...store, zoho: { ...store.zoho, oauthState: state, lastError: "" } },
    url: buildAuthorizeUrl(store.zoho, state),
  };
}

export async function finishOAuth(store: Store, query: Record<string, unknown>, now: string): Promise<Store> {
  const error = clip(query.error, 80);
  if (error === "access_denied") throw new AppError("La connexion a été annulée dans Zoho.");
  if (error) throw new AppError("Zoho n'a pas autorisé la connexion.");
  const code = clip(query.code, 2000);
  const state = clip(query.state, 80);
  if (!code || !state || state !== store.zoho.oauthState) {
    throw new AppError("La connexion Zoho a été interrompue. Recommencez depuis cette application.");
  }
  const location = clip(query.location, 20).toLowerCase();
  const dataCenter = LOCATION[location] ?? store.zoho.dataCenter;
  const accounts = accountsBase(clip(query.accountsServer, 160), location, dataCenter);
  const payload = await postToken(
    accounts,
    new URLSearchParams({
      code,
      client_id: store.zoho.clientId,
      client_secret: store.zoho.clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  );
  const accessToken = clip(payload.access_token, 4000);
  const refreshToken = clip(payload.refresh_token, 4000) || store.zoho.refreshToken;
  if (!accessToken || !refreshToken) throw new AppError("Zoho n'a pas renvoyé de jeton. Relancez la connexion et acceptez l'accès.");
  let zoho: ZohoConnection = {
    ...store.zoho,
    dataCenter,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: expiryFrom(payload.expires_in),
    apiDomain: allowedApiUrl(clip(payload.api_domain, 120)) ?? dataCenterOf(dataCenter).api,
    accountsServer: accounts,
    oauthState: "",
    connectedAt: now,
    lastError: "",
  };
  try {
    const listed = await listOrganizations(zoho);
    zoho = { ...listed.zoho, organizations: listed.organizations };
    const current = listed.organizations.find((org) => org.organizationId === zoho.organizationId);
    if (current) zoho.organizationName = current.name;
    else if (listed.organizations.length === 1) {
      zoho.organizationId = listed.organizations[0].organizationId;
      zoho.organizationName = listed.organizations[0].name;
    } else {
      zoho.organizationId = "";
      zoho.organizationName = "";
    }
    if (listed.organizations.length === 0) {
      zoho.lastError = "Aucune organisation Zoho Invoice n'est accessible avec ce compte.";
    }
  } catch (caught) {
    zoho.lastError = caught instanceof AppError ? caught.message : "Les organisations Zoho n'ont pas pu être lues.";
  }
  return { ...store, zoho };
}

export function selectOrganization(store: Store, organizationId: string): Store {
  const org = store.zoho.organizations.find((entry) => entry.organizationId === organizationId);
  if (!org) throw new AppError("Cette organisation n'est pas dans la liste renvoyée par Zoho.");
  return {
    ...store,
    zoho: { ...store.zoho, organizationId: org.organizationId, organizationName: org.name, lastError: "" },
  };
}

export function disconnectZoho(store: Store): Store {
  return {
    ...store,
    zoho: {
      ...store.zoho,
      refreshToken: "",
      accessToken: "",
      accessTokenExpiresAt: "",
      apiDomain: "",
      accountsServer: "",
      oauthState: "",
      organizationId: "",
      organizationName: "",
      organizations: [],
      connectedAt: "",
      lastError: "",
    },
  };
}

export function forgetZoho(store: Store): Store {
  return { ...store, zoho: emptyZoho() };
}

const BUNDLE_KEYS = ["currencies", "taxes", "contacts", "items", "estimates", "invoices", "payments"] as const;

export function importZohoBundle(store: Store, bundle: ZohoBundle, clock: Clock): Store {
  for (const key of BUNDLE_KEYS) {
    if (!Array.isArray(bundle?.[key])) throw new AppError("Le lot Zoho est incomplet.");
  }
  const applied = applyZohoImport(store, bundle, clock);
  return {
    ...applied.store,
    zoho: {
      ...applied.store.zoho,
      lastImport: applied.report,
      lastImportAt: clock.now,
      lastError: "",
    },
  };
}

export async function importFromZoho(store: Store, clock: Clock): Promise<Store> {
  if (!store.zoho.refreshToken) throw new AppError("Connectez d'abord Zoho Invoice.");
  if (!store.zoho.organizationId) throw new AppError("Choisissez l'organisation Zoho à importer.");
  let zoho = store.zoho;
  const take = async (path: string, key: string) => {
    const result = await listAll(zoho, path, key, true);
    zoho = result.zoho;
    return result.rows;
  };
  const currencies = await take("settings/currencies", "currencies");
  const taxes = await take("settings/taxes", "taxes");
  const contacts = await take("contacts", "contacts");
  const items = await take("items", "items");
  const estimateRows = await take("estimates", "estimates");
  const estimates = await withDetails(zoho, estimateRows, "estimates", "estimate_id", ["estimate"], needsLines);
  zoho = estimates.zoho;
  const invoiceRows = await take("invoices", "invoices");
  const invoices = await withDetails(zoho, invoiceRows, "invoices", "invoice_id", ["invoice"], needsLines);
  zoho = invoices.zoho;
  const paymentRows = await take("customerpayments", "customerpayments");
  const payments = await withDetails(zoho, paymentRows, "customerpayments", "payment_id", ["payment"], needsInvoices);
  zoho = payments.zoho;
  const applied = applyZohoImport(
    { ...store, zoho },
    {
      currencies,
      taxes,
      contacts,
      items,
      estimates: estimates.rows,
      invoices: invoices.rows,
      payments: payments.rows,
    },
    clock,
  );
  return {
    ...applied.store,
    zoho: {
      ...applied.store.zoho,
      lastImport: applied.report,
      lastImportAt: clock.now,
      lastError: "",
    },
  };
}

async function listOrganizations(zoho: ZohoConnection): Promise<{ zoho: ZohoConnection; organizations: ZohoOrganization[] }> {
  const result = await listAll(zoho, "organizations", "organizations", false);
  const organizations = result.rows.flatMap((row) => {
    const raw = record(row);
    if (!raw) return [];
    const organizationId = clip(raw.organization_id, 40);
    if (!organizationId) return [];
    const currency = clip(raw.currency_code, 8).toUpperCase();
    return [
      {
        organizationId,
        name: clip(raw.name, 160) || "Organisation",
        currencyCode: /^[A-Z]{3}$/.test(currency) ? currency : "EUR",
      },
    ];
  });
  return { zoho: result.zoho, organizations };
}

async function listAll(
  zoho: ZohoConnection,
  path: string,
  key: string,
  withOrg: boolean,
): Promise<{ zoho: ZohoConnection; rows: unknown[] }> {
  const rows: unknown[] = [];
  let current = zoho;
  for (let page = 1; page <= 100; page += 1) {
    const result = await apiGet(current, path, { page: String(page), per_page: "200" }, withOrg);
    current = result.zoho;
    const chunk = record(result.body)?.[key];
    if (Array.isArray(chunk)) rows.push(...chunk);
    const context = record(record(result.body)?.page_context);
    if (context?.has_more_page !== true) break;
  }
  return { zoho: current, rows };
}

async function withDetails(
  zoho: ZohoConnection,
  rows: unknown[],
  path: string,
  idKey: string,
  wrappers: string[],
  needs: (row: unknown) => boolean,
): Promise<{ zoho: ZohoConnection; rows: unknown[] }> {
  const detailed: unknown[] = [];
  let current = zoho;
  for (const row of rows) {
    const raw = record(row);
    const id = raw ? clip(raw[idKey], 80) : "";
    if (!raw || !id || !needs(raw)) {
      detailed.push(row);
      continue;
    }
    try {
      const result = await apiGet(current, `${path}/${encodeURIComponent(id)}`, {}, true);
      current = result.zoho;
      detailed.push(unwrap(result.body, wrappers) ?? row);
    } catch {
      detailed.push(row);
    }
  }
  return { zoho: current, rows: detailed };
}

async function apiGet(
  zoho: ZohoConnection,
  path: string,
  query: Record<string, string>,
  withOrg: boolean,
): Promise<{ zoho: ZohoConnection; body: unknown }> {
  let current = await ensureAccess(zoho);
  let response = await callZoho(current, path, query, withOrg);
  if (response.status === 401) {
    current = await refreshAccess(current);
    response = await callZoho(current, path, query, withOrg);
  }
  if (response.status === 429) {
    await sleep(2000);
    response = await callZoho(current, path, query, withOrg);
  }
  const payload = await readJson(response);
  if (!response.ok || zohoFailed(payload)) throw new AppError(zohoMessage(payload, response.status));
  return { zoho: current, body: payload };
}

async function callZoho(zoho: ZohoConnection, path: string, query: Record<string, string>, withOrg: boolean): Promise<Response> {
  const url = new URL(`${apiBase(zoho)}/invoice/v3/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (withOrg && zoho.organizationId) url.searchParams.set("organization_id", zoho.organizationId);
  const headers: Record<string, string> = { Authorization: `Zoho-oauthtoken ${zoho.accessToken}` };
  if (withOrg && zoho.organizationId) headers["X-com-zoho-invoice-organizationid"] = zoho.organizationId;
  return fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
}

async function ensureAccess(zoho: ZohoConnection): Promise<ZohoConnection> {
  const expiry = Date.parse(zoho.accessTokenExpiresAt);
  if (zoho.accessToken && Number.isFinite(expiry) && expiry > Date.now() + 30_000) return zoho;
  return refreshAccess(zoho);
}

async function refreshAccess(zoho: ZohoConnection): Promise<ZohoConnection> {
  if (!zoho.refreshToken) throw new AppError("La connexion Zoho a expiré. Reconnectez-vous.");
  const accounts = allowedAccountsUrl(zoho.accountsServer) ?? dataCenterOf(zoho.dataCenter).accounts;
  const payload = await postToken(
    accounts,
    new URLSearchParams({
      refresh_token: zoho.refreshToken,
      client_id: zoho.clientId,
      client_secret: zoho.clientSecret,
      grant_type: "refresh_token",
    }),
  );
  const accessToken = clip(payload.access_token, 4000);
  if (!accessToken) throw new AppError("Le jeton Zoho n'a pas pu être renouvelé. Reconnectez-vous.");
  return {
    ...zoho,
    accessToken,
    accessTokenExpiresAt: expiryFrom(payload.expires_in),
    apiDomain: allowedApiUrl(clip(payload.api_domain, 120)) ?? zoho.apiDomain,
    accountsServer: accounts,
  };
}

async function postToken(accounts: string, body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await readJson(response);
  if (!response.ok || zohoFailed(payload)) throw new AppError(zohoMessage(payload, response.status));
  return record(payload) ?? {};
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function zohoFailed(payload: unknown): boolean {
  const raw = record(payload);
  if (!raw) return true;
  if (typeof raw.error === "string" && raw.error) return true;
  if (typeof raw.code === "number" && raw.code !== 0) return true;
  return false;
}

function zohoMessage(payload: unknown, status: number): string {
  const raw = record(payload);
  const code = raw && typeof raw.error === "string" ? raw.error : "";
  if (code === "invalid_client") return "Identifiant ou secret Zoho refusé. Vérifiez le client de la console API.";
  if (code === "invalid_code") return "Le code Zoho a expiré. Relancez la connexion.";
  if (code === "invalid_redirect_uri" || code === "redirect_uri_mismatch") {
    return "L'adresse de redirection ne correspond pas à celle enregistrée dans Zoho.";
  }
  if (code === "access_denied") return "L'accès a été refusé dans Zoho.";
  const message = raw && typeof raw.message === "string" ? raw.message.replace(/[\r\n]/g, " ").slice(0, 180) : "";
  if (message && !/token|secret|bearer/i.test(message)) return `Zoho a répondu : ${message}`;
  return `Zoho a refusé la requête (${status}).`;
}

function accountsBase(accountsServer: string, location: string, dataCenter: DataCenterId): string {
  return allowedAccountsUrl(accountsServer) ?? dataCenterOf(LOCATION[location] ?? dataCenter).accounts;
}

function apiBase(zoho: ZohoConnection): string {
  return allowedApiUrl(zoho.apiDomain) ?? dataCenterOf(zoho.dataCenter).api;
}

function expiryFrom(value: unknown): string {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : 3600;
  return new Date(Date.now() + Math.max(60, seconds) * 1000 - 60_000).toISOString();
}

function unwrap(body: unknown, keys: string[]): unknown {
  const raw = record(body);
  if (!raw) return body;
  for (const key of keys) if (record(raw[key])) return raw[key];
  return body;
}

function needsLines(row: unknown): boolean {
  const raw = record(row);
  return !raw || !Array.isArray(raw.line_items);
}

function needsInvoices(row: unknown): boolean {
  const raw = record(row);
  return !raw || !Array.isArray(raw.invoices);
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
