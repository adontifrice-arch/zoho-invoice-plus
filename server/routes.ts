import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { systemClock } from "../shared/clock.js";
import type { Store } from "../shared/types.js";
import {
  AppError,
  convertQuote,
  createCreditNote,
  createCustomer,
  createInvoice,
  createItem,
  createPayment,
  createQuote,
  deleteCreditNote,
  deleteInvoice,
  deletePayment,
  deleteQuote,
  duplicateInvoice,
  duplicateQuote,
  issueInvoice,
  removeCustomer,
  removeItem,
  setQuoteStatus,
  updateCustomer,
  updateInvoice,
  updateItem,
  updateQuote,
  updateSettings,
  voidInvoice,
} from "./logic.js";
import type { CreditInput, CustomerInput, DocumentInput, ItemInput, PaymentInput } from "./logic.js";
import { creditModel, invoiceModel, quoteModel, renderPdf } from "./pdf.js";
import { readStore, resetStore, saveStore } from "./store.js";

export const router = Router();

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function stateBody(store: Store = readStore()) {
  return { today: systemClock().today, ...store };
}

function sendPdf(res: Response, filename: string, pdf: Buffer): void {
  const ascii = filename.replace(/[^\w.\-]+/g, "_");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(pdf);
}

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.get("/state", (_req, res) => {
  res.json(stateBody());
});

router.put("/settings", (req, res) => {
  const store = updateSettings(readStore(), req.body ?? {});
  saveStore(store);
  res.json(stateBody());
});

router.post("/demo/reset", (_req, res) => {
  resetStore();
  res.json(stateBody());
});

router.post("/customers", (req, res) => {
  const { store, customer } = createCustomer(readStore(), req.body as CustomerInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: customer.id });
});

router.put("/customers/:id", (req, res) => {
  const { store } = updateCustomer(readStore(), param(req.params.id), req.body as CustomerInput, systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.delete("/customers/:id", (req, res) => {
  const result = removeCustomer(readStore(), param(req.params.id), systemClock());
  saveStore(result.store);
  res.json({ ...stateBody(), deleted: result.deleted, archived: result.archived });
});

router.post("/items", (req, res) => {
  const { store, item } = createItem(readStore(), req.body as ItemInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: item.id });
});

router.put("/items/:id", (req, res) => {
  const { store } = updateItem(readStore(), param(req.params.id), req.body as ItemInput, systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.delete("/items/:id", (req, res) => {
  const result = removeItem(readStore(), param(req.params.id), systemClock());
  saveStore(result.store);
  res.json({ ...stateBody(), deleted: result.deleted, archived: result.archived });
});

router.post("/quotes", (req, res) => {
  const { store, quote } = createQuote(readStore(), req.body as DocumentInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: quote.id });
});

router.put("/quotes/:id", (req, res) => {
  const { store } = updateQuote(readStore(), param(req.params.id), req.body as DocumentInput, systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.post("/quotes/:id/status", (req, res) => {
  const status = (req.body as { status?: unknown } | undefined)?.status;
  const { store } = setQuoteStatus(readStore(), param(req.params.id), status, systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.post("/quotes/:id/convert", (req, res) => {
  const { store, invoice } = convertQuote(readStore(), param(req.params.id), systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: invoice.id });
});

router.post("/quotes/:id/duplicate", (req, res) => {
  const { store, quote } = duplicateQuote(readStore(), param(req.params.id), systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: quote.id });
});

router.delete("/quotes/:id", (req, res) => {
  saveStore(deleteQuote(readStore(), param(req.params.id)));
  res.json({ ...stateBody(), deleted: true });
});

router.get("/quotes/:id/pdf", async (req, res) => {
  const store = readStore();
  const quote = store.quotes.find((entry) => entry.id === param(req.params.id));
  if (!quote) throw new AppError("Devis introuvable.", 404);
  const pdf = await renderPdf(store, quoteModel(store, quote));
  sendPdf(res, `Devis-${quote.number}.pdf`, pdf);
});

router.post("/invoices", (req, res) => {
  const { store, invoice } = createInvoice(readStore(), req.body as DocumentInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: invoice.id });
});

router.put("/invoices/:id", (req, res) => {
  const { store } = updateInvoice(readStore(), param(req.params.id), req.body as DocumentInput, systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.post("/invoices/:id/issue", (req, res) => {
  const { store } = issueInvoice(readStore(), param(req.params.id), systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.post("/invoices/:id/void", (req, res) => {
  const { store } = voidInvoice(readStore(), param(req.params.id), systemClock());
  saveStore(store);
  res.json(stateBody());
});

router.post("/invoices/:id/duplicate", (req, res) => {
  const { store, invoice } = duplicateInvoice(readStore(), param(req.params.id), systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: invoice.id });
});

router.delete("/invoices/:id", (req, res) => {
  saveStore(deleteInvoice(readStore(), param(req.params.id), systemClock()));
  res.json({ ...stateBody(), deleted: true });
});

router.get("/invoices/:id/pdf", async (req, res) => {
  const store = readStore();
  const invoice = store.invoices.find((entry) => entry.id === param(req.params.id));
  if (!invoice) throw new AppError("Facture introuvable.", 404);
  const pdf = await renderPdf(store, invoiceModel(store, invoice));
  const name = invoice.number || "brouillon";
  sendPdf(res, `Facture-${name}.pdf`, pdf);
});

router.post("/invoices/:id/credit-notes", (req, res) => {
  const { store, creditNote } = createCreditNote(readStore(), param(req.params.id), req.body as CreditInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: creditNote.id });
});

router.delete("/credit-notes/:id", (req, res) => {
  saveStore(deleteCreditNote(readStore(), param(req.params.id)));
  res.json({ ...stateBody(), deleted: true });
});

router.get("/credit-notes/:id/pdf", async (req, res) => {
  const store = readStore();
  const note = store.creditNotes.find((entry) => entry.id === param(req.params.id));
  if (!note) throw new AppError("Avoir introuvable.", 404);
  const pdf = await renderPdf(store, creditModel(store, note));
  sendPdf(res, `Avoir-${note.number}.pdf`, pdf);
});

router.post("/invoices/:id/payments", (req, res) => {
  const { store, payment } = createPayment(readStore(), param(req.params.id), req.body as PaymentInput, systemClock());
  saveStore(store);
  res.status(201).json({ ...stateBody(), createdId: payment.id });
});

router.delete("/payments/:id", (req, res) => {
  saveStore(deletePayment(readStore(), param(req.params.id)));
  res.json({ ...stateBody(), deleted: true });
});

export function apiError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Requête illisible." });
    return;
  }
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: "Erreur interne." });
}
