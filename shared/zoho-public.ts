import type { DataCenterId, PublicZoho, ZohoConnection } from "./types.js";

export const HOME_URL = "http://127.0.0.1:4173";
export const REDIRECT_URI = "http://127.0.0.1:4173/api/zoho/callback";

export const ZOHO_SCOPES = [
  "ZohoInvoice.contacts.READ",
  "ZohoInvoice.settings.READ",
  "ZohoInvoice.estimates.READ",
  "ZohoInvoice.invoices.READ",
  "ZohoInvoice.customerpayments.READ",
].join(",");

export const DATA_CENTERS: {
  id: DataCenterId;
  label: string;
  accounts: string;
  api: string;
  console: string;
}[] = [
  { id: "eu", label: "Europe", accounts: "https://accounts.zoho.eu", api: "https://www.zohoapis.eu", console: "https://api-console.zoho.eu/" },
  { id: "com", label: "États-Unis", accounts: "https://accounts.zoho.com", api: "https://www.zohoapis.com", console: "https://api-console.zoho.com/" },
  { id: "in", label: "Inde", accounts: "https://accounts.zoho.in", api: "https://www.zohoapis.in", console: "https://api-console.zoho.in/" },
  { id: "com.au", label: "Australie", accounts: "https://accounts.zoho.com.au", api: "https://www.zohoapis.com.au", console: "https://api-console.zoho.com.au/" },
  { id: "jp", label: "Japon", accounts: "https://accounts.zoho.jp", api: "https://www.zohoapis.jp", console: "https://api-console.zoho.jp/" },
  { id: "ca", label: "Canada", accounts: "https://accounts.zohocloud.ca", api: "https://www.zohoapis.ca", console: "https://api-console.zohocloud.ca/" },
  { id: "sa", label: "Arabie saoudite", accounts: "https://accounts.zoho.sa", api: "https://www.zohoapis.sa", console: "https://api-console.zoho.sa/" },
  { id: "uk", label: "Royaume-Uni", accounts: "https://accounts.zoho.uk", api: "https://www.zohoapis.uk", console: "https://api-console.zoho.uk/" },
];

export function dataCenterOf(id: DataCenterId) {
  return DATA_CENTERS.find((entry) => entry.id === id) ?? DATA_CENTERS[0];
}

export function isDataCenter(value: unknown): value is DataCenterId {
  return DATA_CENTERS.some((entry) => entry.id === value);
}

export function emptyZoho(): ZohoConnection {
  return {
    dataCenter: "eu",
    clientId: "",
    clientSecret: "",
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
    lastImportAt: "",
    lastImport: null,
    lastError: "",
    ignoredIds: [],
  };
}

export function toPublicZoho(zoho: ZohoConnection): PublicZoho {
  return {
    dataCenter: zoho.dataCenter,
    clientId: zoho.clientId,
    hasClientSecret: zoho.clientSecret.length > 0,
    connected: zoho.refreshToken.length > 0,
    organizationId: zoho.organizationId,
    organizationName: zoho.organizationName,
    organizations: zoho.organizations,
    connectedAt: zoho.connectedAt,
    lastImportAt: zoho.lastImportAt,
    lastImport: zoho.lastImport,
    lastError: zoho.lastError,
  };
}

export function allowedAccountsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const known = DATA_CENTERS.some((entry) => new URL(entry.accounts).hostname === url.hostname);
    if (!known) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function allowedApiUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const known = DATA_CENTERS.some((entry) => new URL(entry.api).hostname === url.hostname);
    if (!known) return null;
    return url.origin;
  } catch {
    return null;
  }
}
