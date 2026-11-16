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
  removeDemoRecords,
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
import { beginOAuth, disconnectZoho, finishOAuth, forgetZoho, importFromZoho, importZohoBundle, saveZohoConfig, selectOrganization } from "./zoho.js";
import { toPublicZoho } from "../shared/zoho-public.js";

export const router = Router();

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function stateBody(store: Store = readStore()) {
  return { today: systemClock().today, ...store, zoho: toPublicZoho(store.zoho) };
}

function queryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
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

router.post("/demo/purge", (_req, res) => {
  const { store, removed } = removeDemoRecords(readStore());
  saveStore(store);
  res.json({
    removed,
    customers: store.customers.length,
    items: store.items.length,
    quotes: store.quotes.length,
    invoices: store.invoices.length,
    creditNotes: store.creditNotes.length,
    payments: store.payments.length,
  });
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

router.post("/zoho/config", (req, res) => {
  saveStore(saveZohoConfig(readStore(), req.body ?? {}));
  res.json(stateBody());
});

router.get("/zoho/start", (_req, res) => {
  try {
    const begun = beginOAuth(readStore());
    saveStore(begun.store);
    res.redirect(begun.url);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Connexion Zoho impossible.";
    const current = readStore();
    saveStore({ ...current, zoho: { ...current.zoho, lastError: message } });
    res.redirect("/import-zoho");
  }
});

router.get("/zoho/callback", async (req, res) => {
  try {
    const next = await finishOAuth(
      readStore(),
      {
        error: queryText(req.query.error),
        code: queryText(req.query.code),
        state: queryText(req.query.state),
        location: queryText(req.query.location),
        accountsServer: queryText(req.query["accounts-server"]),
      },
      systemClock().now,
    );
    saveStore(next);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "La connexion Zoho a échoué.";
    const current = readStore();
    saveStore({ ...current, zoho: { ...current.zoho, oauthState: "", lastError: message } });
  }
  res.redirect("/import-zoho");
});

router.post("/zoho/organization", (req, res) => {
  const organizationId = typeof req.body?.organizationId === "string" ? req.body.organizationId : "";
  saveStore(selectOrganization(readStore(), organizationId));
  res.json(stateBody());
});

router.post("/zoho/bundle", (req, res) => {
  const body = req.body ?? {};
  let store = importZohoBundle(readStore(), body, systemClock());
  const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim().slice(0, 40) : "";
  const organizationName = typeof body.organizationName === "string" ? body.organizationName.trim().slice(0, 160) : "";
  if (organizationId || organizationName) {
    store = {
      ...store,
      zoho: {
        ...store.zoho,
        organizationId: organizationId || store.zoho.organizationId,
        organizationName: organizationName || store.zoho.organizationName,
        dataCenter: store.zoho.dataCenter || "eu",
      },
    };
  }
  if (body.settings && typeof body.settings === "object") store = updateSettings(store, body.settings);
  saveStore(store);
  res.json({
    imported: store.zoho.lastImport,
    customers: store.customers.length,
    items: store.items.length,
    invoices: store.invoices.length,
    payments: store.payments.length,
  });
});

router.post("/zoho/import", async (_req, res, next) => {
  try {
    saveStore(await importFromZoho(readStore(), systemClock()));
    res.json(stateBody());
  } catch (error) {
    if (error instanceof AppError) {
      const current = readStore();
      saveStore({ ...current, zoho: { ...current.zoho, lastError: error.message } });
    }
    next(error);
  }
});

router.post("/zoho/disconnect", (_req, res) => {
  saveStore(disconnectZoho(readStore()));
  res.json(stateBody());
});

router.post("/zoho/forget", (_req, res) => {
  saveStore(forgetZoho(readStore()));
  res.json(stateBody());
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
