import assert from "node:assert/strict";
import { systemClock } from "../shared/clock.js";
import { parseMoneyToCents } from "../shared/format.js";
import { documentTotals, invoiceBalance, invoiceViewStatus } from "../shared/money.js";
import { dashboard } from "../shared/stats.js";
import type { Clock } from "../shared/types.js";
import {
  AppError,
  convertQuote,
  createCreditNote,
  createCustomer,
  createInvoice,
  createPayment,
  deletePayment,
  issueInvoice,
  removeCustomer,
  voidInvoice,
} from "./logic.js";
import { creditModel, invoiceModel, renderPdf } from "./pdf.js";
import { seedStore } from "./seed.js";

const clock: Clock = { today: "2026-11-16", now: "2026-11-16T09:00:00.000Z" };

function throws(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.match(error.message, pattern);
    return true;
  });
}

const store = seedStore(clock);
const numbers = new Set<string>();
for (const invoice of store.invoices) {
  if (invoice.number) {
    assert.equal(numbers.has(invoice.number), false);
    numbers.add(invoice.number);
  }
  assert.ok(store.customers.some((customer) => customer.id === invoice.customerId));
}
assert.equal(store.invoices.find((invoice) => invoice.id === "inv_soies_draft")?.number, "");

const hotel = store.invoices.find((invoice) => invoice.id === "inv_soies");
const orbe = store.invoices.find((invoice) => invoice.id === "inv_orbe");
const quai = store.invoices.find((invoice) => invoice.id === "inv_quai");
const bellevue = store.invoices.find((invoice) => invoice.id === "inv_bellevue");
const mistral = store.invoices.find((invoice) => invoice.id === "inv_mistral");
assert.ok(hotel && orbe && quai && bellevue && mistral);

const hotelBalance = invoiceBalance(hotel, store.creditNotes, store.payments);
const orbeBalance = invoiceBalance(orbe, store.creditNotes, store.payments);
const quaiBalance = invoiceBalance(quai, store.creditNotes, store.payments);
const bellevueBalance = invoiceBalance(bellevue, store.creditNotes, store.payments);
const mistralBalance = invoiceBalance(mistral, store.creditNotes, store.payments);

assert.equal(hotelBalance.due, 0);
assert.equal(hotelBalance.paid, hotelBalance.ttc);
assert.ok(orbeBalance.paid > 0 && orbeBalance.due > 0);
assert.equal(quaiBalance.paid, 0);
assert.equal(quaiBalance.due, quaiBalance.ttc);
assert.equal(mistralBalance.due, 0);
assert.ok(mistralBalance.credited > 0 && mistralBalance.paid > 0);
assert.equal(documentTotals(bellevue.lines).vatBreakdown.length, 2);

assert.equal(invoiceViewStatus(orbe, orbeBalance, clock.today), "overdue");
assert.equal(invoiceViewStatus(quai, quaiBalance, clock.today), "overdue");
assert.equal(invoiceViewStatus(bellevue, bellevueBalance, clock.today), "issued");
assert.equal(invoiceViewStatus(hotel, hotelBalance, clock.today), "paid");
assert.equal(invoiceViewStatus(mistral, mistralBalance, clock.today), "paid");

const quoteStatuses = new Set(store.quotes.map((quote) => quote.status));
for (const status of ["draft", "sent", "accepted", "refused", "invoiced"]) {
  assert.equal(quoteStatuses.has(status as "draft"), true, status);
}

const stats = dashboard(store, clock.today);
assert.ok(stats.overdueCount >= 2);
assert.ok(stats.unpaidCents > stats.overdueCents);
assert.ok(stats.collectedThisMonth > 0);
assert.ok(stats.billedThisMonth > 0);
assert.equal(stats.openQuoteCount, 1);
assert.equal(stats.acceptedQuoteCount, 1);

const issued = issueInvoice(store, "inv_soies_draft", clock);
assert.equal(issued.invoice.status, "issued");
assert.equal(issued.invoice.number, "FAC-2026-006");
assert.equal(issued.store.settings.nextInvoice, 7);

throws(
  () => createPayment(store, "inv_quai", { amountCents: 999_999_999, date: clock.today, method: "transfer" }, clock),
  /dépasse/,
);
throws(() => voidInvoice(store, "inv_soies", clock), /paiements/);
throws(
  () =>
    createCreditNote(
      store,
      "inv_quai",
      {
        issueDate: clock.today,
        lines: [{ description: "Trop", quantity: 40, unit: "heure", unitPriceCents: 1_000_000, vatBps: 2000 }],
      },
      clock,
    ),
  /dépasse/,
);

const withoutOrbePayment = deletePayment(store, "pay_orbe");
const orbeAfter = withoutOrbePayment.invoices.find((invoice) => invoice.id === "inv_orbe");
assert.ok(orbeAfter);
assert.equal(
  invoiceBalance(orbeAfter, withoutOrbePayment.creditNotes, withoutOrbePayment.payments).due,
  documentTotals(orbeAfter.lines).ttc,
);

const converted = convertQuote(store, "quo_signal", clock);
assert.equal(converted.invoice.status, "draft");
assert.equal(converted.invoice.number, "");
assert.equal(converted.invoice.customerId, "cus_quai");
assert.equal(converted.store.quotes.find((quote) => quote.id === "quo_signal")?.invoiceId, converted.invoice.id);
throws(() => convertQuote(converted.store, "quo_signal", clock), /déjà lié/);

const voided = voidInvoice(store, "inv_bellevue", clock);
assert.equal(voided.invoice.status, "void");
assert.equal(voided.invoice.number, bellevue.number);
assert.equal(voided.store.quotes.find((quote) => quote.id === "quo_bellevue")?.status, "accepted");
assert.equal(voided.store.quotes.find((quote) => quote.id === "quo_bellevue")?.invoiceId, null);

throws(() => createCustomer(store, { email: "pas un email" }, clock), /nom ou une société|e-mail/);
const archived = removeCustomer(store, "cus_soies", clock);
assert.equal(archived.archived, true);
assert.equal(archived.deleted, false);
throws(
  () =>
    createInvoice(
      archived.store,
      {
        customerId: "cus_soies",
        issueDate: clock.today,
        dueDate: "2026-12-16",
        lines: [{ description: "Essai", quantity: 1, unit: "heure", unitPriceCents: 1000, vatBps: 2000 }],
      },
      clock,
    ),
  /archivé/,
);

assert.equal(parseMoneyToCents("1 250,50"), 125050);
assert.equal(parseMoneyToCents("0,70"), 70);
assert.equal(parseMoneyToCents("12"), 1200);
assert.equal(parseMoneyToCents("12,2"), 1220);
assert.equal(parseMoneyToCents("-5"), null);

const live = systemClock(new Date("2026-11-16T23:30:00Z"));
assert.equal(live.today, "2026-11-17");

const pdf = await renderPdf(store, invoiceModel(store, hotel));
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
const raw = pdf.toString("latin1");
assert.match(raw, /Lumen/);
assert.match(raw, /FACTURE/);
assert.match(raw, new RegExp(hotel.number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.equal(raw.match(/\/Type \/Page(?!s)/g)?.length, 1);

const creditPdf = await renderPdf(store, creditModel(store, store.creditNotes[0]));
assert.match(creditPdf.toString("latin1"), /AVOIR/);

console.log("tests ok");
console.log(
  JSON.stringify(
    {
      hotel: hotel.number,
      hotelTtc: hotelBalance.ttc,
      orbeDue: orbeBalance.due,
      quaiDue: quaiBalance.due,
      bellevueTtc: bellevueBalance.ttc,
      mistralPaid: mistralBalance.paid,
      stats,
    },
    null,
    2,
  ),
);
