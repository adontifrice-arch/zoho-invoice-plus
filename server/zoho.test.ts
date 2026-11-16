import assert from "node:assert/strict";
import { systemClock } from "../shared/clock.js";
import { dashboard } from "../shared/stats.js";
import { applyZohoImport, ignoreZohoId, mapInvoiceStatus, mapQuoteStatus, toBps } from "../shared/zoho-import.js";
import type { ZohoBundle } from "../shared/zoho-import.js";
import { emptyZoho, toPublicZoho } from "../shared/zoho-public.js";
import { normalizeStore } from "./normalize.js";
import { seedStore } from "./seed.js";
import { buildAuthorizeUrl, saveZohoConfig } from "./zoho.js";

const clock = { now: "2026-11-16T10:00:00.000Z", today: "2026-11-16" };

const bundle: ZohoBundle = {
  currencies: [{ currency_id: "cur1", currency_code: "EUR", currency_name: "Euro", currency_symbol: "€", is_base_currency: true }],
  taxes: [{ tax_id: "tax1", tax_name: "TVA 19,6", tax_percentage: 19.6 }],
  contacts: [
    {
      contact_id: "c-zoho",
      contact_name: "Camille Ferrand",
      company_name: "Hôtel des Soies",
      email: "import@example.com",
      phone: "0102030405",
      billing_address: { address: "1 rue Neuve", zip: "69002", city: "Lyon", country: "France" },
      vat_reg_no: "FR00999999999",
    },
  ],
  items: [{ item_id: "item-z", name: "Conseil", rate: 100, unit: "heure", tax_percentage: 19.6, sku: "zoho" }],
  estimates: [
    {
      estimate_id: "e1",
      estimate_number: "EST-1",
      customer_id: "c-zoho",
      status: "invoiced",
      date: "2026-10-01",
      expiry_date: "2026-10-31",
      currency_code: "USD",
      line_items: [{ name: "Conseil", quantity: 2, rate: 100, tax_percentage: 19.6, item_id: "item-z" }],
    },
  ],
  invoices: [
    {
      invoice_id: "i1",
      invoice_number: "INV-1",
      customer_id: "c-zoho",
      status: "sent",
      date: "2026-11-01",
      due_date: "2026-12-01",
      currency_code: "USD",
      estimate_id: "e1",
      line_items: [{ name: "Conseil", description: "Atelier", quantity: 2, rate: 100, tax_percentage: 19.6, item_id: "item-z" }],
    },
  ],
  payments: [
    {
      payment_id: "p1",
      payment_number: "PAY-9",
      date: "2026-11-02",
      payment_mode: "Bank Transfer",
      reference_number: "VIR",
      currency_code: "USD",
      invoices: [
        { invoice_id: "i1", amount_applied: 10.5 },
        { invoice_id: "i2", amount_applied: 3 },
      ],
    },
  ],
};

const seeded = seedStore(systemClock());
const before = dashboard(seeded, systemClock().today);

const first = applyZohoImport(seeded, bundle, clock);
const demo = first.store.customers.find((customer) => customer.id === "cus_soies");
const imported = first.store.customers.find((customer) => customer.zohoId === "c-zoho");
assert.ok(demo);
assert.equal(demo.zohoId, null);
assert.equal(demo.name, "Camille Ferrand");
assert.ok(imported);
assert.notEqual(imported.id, demo.id);
assert.equal(imported.phone, "0102030405");
assert.equal(first.report.customers.created, 1);
assert.equal(first.store.taxes[0]?.rateBps, 1960);
assert.equal(toBps(19.6), 1960);
assert.equal(first.store.invoices.find((invoice) => invoice.zohoId === "i1")?.currencyCode, "USD");
assert.equal(first.store.invoices.find((invoice) => invoice.zohoId === "i1")?.lines[0]?.vatBps, 1960);
const quote = first.store.quotes.find((entry) => entry.zohoId === "e1");
const invoice = first.store.invoices.find((entry) => entry.zohoId === "i1");
assert.equal(quote?.status, "invoiced");
assert.equal(quote?.invoiceId, invoice?.id);
assert.equal(invoice?.quoteId, quote?.id);
assert.equal(invoice?.status, "issued");
const payment = first.store.payments.find((entry) => entry.zohoId === "p1:i1");
assert.equal(payment?.amountCents, 1050);
assert.equal(payment?.method, "transfer");
assert.equal(payment?.invoiceId, invoice?.id);
assert.equal(first.store.payments.filter((entry) => entry.zohoId?.startsWith("p1:")).length, 1);

const after = dashboard(first.store, clock.today);
assert.equal(after.unpaidCents, before.unpaidCents);
assert.equal(after.overdueCents, before.overdueCents);
assert.equal(after.foreignUnpaid[0]?.code, "USD");

const changedPhone = structuredClone(bundle);
const contact = changedPhone.contacts[0] as { phone: string };
contact.phone = "0600000000";
const second = applyZohoImport(first.store, changedPhone, clock);
assert.equal(second.store.customers.find((customer) => customer.zohoId === "c-zoho")?.phone, "0600000000");
assert.equal(second.report.customers.updated, 1);
assert.equal(second.store.customers.find((customer) => customer.id === "cus_soies")?.name, "Camille Ferrand");

const third = applyZohoImport(second.store, changedPhone, clock);
assert.equal(third.report.customers.unchanged, 1);
assert.equal(third.report.invoices.unchanged, 1);

const edited = {
  ...third.store,
  customers: third.store.customers.map((customer) =>
    customer.zohoId === "c-zoho" ? { ...customer, name: "Nom local", locallyEdited: true } : customer,
  ),
};
const renamed = structuredClone(changedPhone);
(renamed.contacts[0] as { contact_name: string; phone: string }).contact_name = "Nom Zoho";
(renamed.contacts[0] as { phone: string }).phone = "0700000000";
const kept = applyZohoImport(edited, renamed, clock);
assert.equal(kept.store.customers.find((customer) => customer.zohoId === "c-zoho")?.name, "Nom local");
assert.equal(kept.store.customers.find((customer) => customer.zohoId === "c-zoho")?.phone, "0600000000");
assert.equal(kept.report.customers.skipped, 1);

let removed = ignoreZohoId(kept.store, "c-zoho");
removed = { ...removed, customers: removed.customers.filter((customer) => customer.zohoId !== "c-zoho") };
const blocked = applyZohoImport(removed, renamed, clock);
assert.equal(blocked.store.customers.some((customer) => customer.zohoId === "c-zoho"), false);
assert.equal(blocked.report.customers.skipped, 1);
assert.equal(blocked.store.customers.some((customer) => customer.id === "cus_soies"), true);

assert.equal(mapInvoiceStatus("overdue"), "issued");
assert.equal(mapInvoiceStatus("void"), "void");
assert.equal(mapInvoiceStatus("draft"), "draft");
assert.equal(mapQuoteStatus("declined"), "refused");
assert.equal(mapQuoteStatus("expired"), "sent");

const legacy = JSON.parse(JSON.stringify(seeded)) as Record<string, unknown>;
delete legacy.zoho;
delete legacy.taxes;
delete legacy.currencies;
for (const key of ["customers", "items", "quotes", "invoices", "payments"]) {
  for (const row of legacy[key] as Record<string, unknown>[]) {
    delete row.zohoId;
    delete row.locallyEdited;
    delete row.currencyCode;
  }
}
const migrated = normalizeStore(legacy);
assert.equal(migrated.customers.length, seeded.customers.length);
assert.equal(migrated.customers[0]?.name, seeded.customers[0]?.name);
assert.equal(migrated.customers[0]?.zohoId, null);
assert.equal(migrated.invoices.length, seeded.invoices.length);
assert.equal(migrated.invoices[0]?.currencyCode, "EUR");
assert.equal(migrated.payments.length, seeded.payments.length);
assert.equal(migrated.zoho.clientSecret, "");

const configured = saveZohoConfig(seeded, { dataCenter: "eu", clientId: "client-id", clientSecret: "super-secret" });
const published = JSON.stringify(toPublicZoho(configured.zoho));
assert.equal(published.includes("super-secret"), false);
assert.equal(published.includes("clientSecret"), false);
assert.equal(published.includes("refreshToken"), false);
assert.equal(toPublicZoho(configured.zoho).hasClientSecret, true);
const secretView = toPublicZoho({ ...configured.zoho, refreshToken: "refresh-token", accessToken: "access-token", oauthState: "nonce" });
assert.equal(secretView.connected, true);
const secretJson = JSON.stringify(secretView);
assert.equal(secretJson.includes("refresh-token"), false);
assert.equal(secretJson.includes("access-token"), false);
assert.equal(secretJson.includes("nonce"), false);

const url = buildAuthorizeUrl({ ...emptyZoho(), clientId: "client-id", clientSecret: "super-secret" }, "state-1");
assert.equal(url.includes(encodeURIComponent("http://127.0.0.1:4173/api/zoho/callback")), true);
assert.equal(url.includes("super-secret"), false);
assert.equal(url.includes("client-id"), true);
assert.equal(url.includes("ZohoInvoice.invoices.READ"), true);

console.log("zoho tests ok");
