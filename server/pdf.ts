import PDFDocument from "pdfkit";
import { customerSubtitle, customerTitle, formatDate, formatMoneyPlain, formatQtyPlain } from "../shared/format.js";
import { paymentMethodLabel } from "../shared/labels.js";
import { documentTotals, invoiceBalance, vatLabel } from "../shared/money.js";
import type { CreditNote, Invoice, Quote, Store } from "../shared/types.js";

const SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf";
const SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf";

const INK = "#1c1915";
const MUTED = "#6d645b";
const PINE = "#234237";
const LINE = "#e3d7c6";
const BAND = "#f4efe6";
const CLAY = "#8d3b28";
const MARGIN = 46;

type Row = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vat: string;
  amount: string;
};

type Total = { label: string; value: string; strong?: boolean; tone?: "pine" | "clay" };

type Column = { label: string; width: number; align: "left" | "right" };

type PdfModel = {
  title: string;
  number: string;
  stamp: string | null;
  seller: string[];
  meta: { label: string; value: string }[];
  customerLabel: string;
  customer: string[];
  columns?: Column[];
  rows: Row[];
  totals: Total[];
  blocks: { title: string; text: string }[];
  footer: string;
};

function sellerLines(store: Store): string[] {
  const settings = store.settings;
  return [
    settings.tagline,
    settings.address,
    `${settings.postalCode} ${settings.city}`.trim(),
    [settings.email, settings.phone].filter(Boolean).join("  ·  "),
    settings.website,
  ].filter((line) => line && line.trim());
}

function partyLines(store: Store, customerId: string): string[] {
  const customer = store.customers.find((entry) => entry.id === customerId);
  if (!customer) return ["Client introuvable"];
  const subtitle = customerSubtitle(customer);
  return [
    customerTitle(customer),
    subtitle,
    customer.address,
    [customer.postalCode, customer.city].filter(Boolean).join(" "),
    customer.country && customer.country !== "France" ? customer.country : "",
    customer.email,
    customer.siret ? `SIRET ${customer.siret}` : "",
    customer.vatNumber ? `TVA ${customer.vatNumber}` : "",
  ].filter((line) => line && line.trim());
}

function rowsFrom(lines: Store["invoices"][number]["lines"], currency: string): Row[] {
  const money = (cents: number) => formatMoneyPlain(cents, currency);
  return lines.map((entry) => {
    const ht = Math.round(entry.quantity * entry.unitPriceCents);
    return {
      description: entry.description,
      quantity: formatQtyPlain(entry.quantity),
      unit: entry.unit,
      unitPrice: money(entry.unitPriceCents),
      vat: vatLabel(entry.vatBps),
      amount: money(ht),
    };
  });
}

function footerOf(store: Store): string {
  const settings = store.settings;
  return [
    settings.companyName,
    settings.legalForm,
    settings.capital ? `au capital de ${settings.capital}` : "",
    settings.siret ? `SIRET ${settings.siret}` : "",
    settings.vatNumber ? `TVA ${settings.vatNumber}` : "",
    settings.rcs,
  ]
    .filter(Boolean)
    .join("  ·  ");
}

export function invoiceModel(store: Store, invoice: Invoice): PdfModel {
  const currency = invoice.currencyCode || "EUR";
  const money = (cents: number) => formatMoneyPlain(cents, currency);
  const totals = documentTotals(invoice.lines);
  const balance = invoiceBalance(invoice, store.creditNotes, store.payments);
  const payments = store.payments.filter((payment) => payment.invoiceId === invoice.id);
  const credits = store.creditNotes.filter((note) => note.invoiceId === invoice.id);
  const quote = invoice.quoteId ? store.quotes.find((entry) => entry.id === invoice.quoteId) : undefined;
  const rows: Total[] = [
    { label: "Total HT", value: money(totals.ht) },
    ...totals.vatBreakdown.map((entry) => ({
      label: `TVA ${vatLabel(entry.bps)}`,
      value: money(entry.vat),
    })),
    { label: "Total TTC", value: money(totals.ttc), strong: true },
  ];
  if (balance.credited > 0) rows.push({ label: "Avoirs", value: money(-balance.credited) });
  if (balance.paid > 0) rows.push({ label: "Déjà réglé", value: money(-balance.paid) });
  if (invoice.status !== "draft") {
    rows.push({
      label: balance.due > 0 ? "Reste à payer" : balance.due < 0 ? "À rembourser" : "Solde",
      value: money(Math.abs(balance.due)),
      strong: true,
      tone: balance.due > 0 ? "clay" : "pine",
    });
  }
  const blocks: PdfModel["blocks"] = [];
  if (payments.length > 0) {
    blocks.push({
      title: "Paiements reçus",
      text: payments
        .map((payment) => `${formatDate(payment.date)}  ·  ${paymentMethodLabel(payment.method)}  ·  ${money(payment.amountCents)}${payment.reference ? `  ·  ${payment.reference}` : ""}`)
        .join("\n"),
    });
  }
  if (credits.length > 0) {
    blocks.push({
      title: "Avoirs déduits",
      text: credits.map((note) => `${note.number} du ${formatDate(note.issueDate)}  ·  ${money(documentTotals(note.lines).ttc)}`).join("\n"),
    });
  }
  if (invoice.status !== "void" && store.settings.iban) {
    blocks.push({
      title: "Règlement",
      text: `Virement à l'ordre de ${store.settings.companyName}\nIBAN ${store.settings.iban}${store.settings.bic ? `\nBIC ${store.settings.bic}` : ""}`,
    });
  }
  if (invoice.notes) blocks.push({ title: "Note", text: invoice.notes });
  if (invoice.terms) blocks.push({ title: "Conditions", text: invoice.terms });
  return {
    title: "FACTURE",
    number: invoice.number || "Brouillon",
    stamp: invoice.status === "draft" ? "BROUILLON" : invoice.status === "void" ? "ANNULÉE" : balance.due <= 0 ? "ACQUITTÉE" : null,
    seller: sellerLines(store),
    meta: [
      { label: "Date", value: formatDate(invoice.issueDate) },
      { label: "Échéance", value: formatDate(invoice.dueDate) },
      ...(quote ? [{ label: "Devis", value: quote.number }] : []),
    ],
    customerLabel: "FACTURÉ À",
    customer: partyLines(store, invoice.customerId),
    rows: rowsFrom(invoice.lines, currency),
    totals: rows,
    blocks,
    footer: footerOf(store),
  };
}

export function quoteModel(store: Store, quote: Quote): PdfModel {
  const currency = quote.currencyCode || "EUR";
  const money = (cents: number) => formatMoneyPlain(cents, currency);
  const totals = documentTotals(quote.lines);
  const blocks: PdfModel["blocks"] = [];
  if (quote.notes) blocks.push({ title: "Note", text: quote.notes });
  if (quote.terms) blocks.push({ title: "Conditions", text: quote.terms });
  return {
    title: "DEVIS",
    number: quote.number,
    stamp: quote.status === "refused" ? "REFUSÉ" : quote.status === "draft" ? "BROUILLON" : null,
    seller: sellerLines(store),
    meta: [
      { label: "Date", value: formatDate(quote.issueDate) },
      { label: "Validité", value: formatDate(quote.validUntil) },
    ],
    customerLabel: "ADRESSÉ À",
    customer: partyLines(store, quote.customerId),
    rows: rowsFrom(quote.lines, currency),
    totals: [
      { label: "Total HT", value: money(totals.ht) },
      ...totals.vatBreakdown.map((entry) => ({ label: `TVA ${vatLabel(entry.bps)}`, value: money(entry.vat) })),
      { label: "Total TTC", value: money(totals.ttc), strong: true },
    ],
    blocks,
    footer: footerOf(store),
  };
}

export function statementModel(store: Store, customerId: string, today: string): PdfModel {
  const customer = store.customers.find((entry) => entry.id === customerId);
  if (!customer) throw new Error("Client introuvable");
  const invoices = store.invoices
    .filter((invoice) => invoice.customerId === customerId && invoice.status === "issued")
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const dueByCurrency = new Map<string, number>();
  const rows: Row[] = invoices.map((invoice) => {
    const currency = invoice.currencyCode || "EUR";
    const money = (cents: number) => formatMoneyPlain(cents, currency);
    const totals = documentTotals(invoice.lines);
    const balance = invoiceBalance(invoice, store.creditNotes, store.payments);
    dueByCurrency.set(currency, (dueByCurrency.get(currency) || 0) + balance.due);
    return {
      description: invoice.number,
      quantity: formatDate(invoice.issueDate),
      unit: formatDate(invoice.dueDate),
      unitPrice: money(totals.ttc),
      vat: money(balance.paid + balance.credited),
      amount: money(balance.due),
    };
  });
  const totals: Total[] = [...dueByCurrency.entries()].map(([code, cents]) => ({
    label: dueByCurrency.size > 1 ? `Reste dû (${code})` : "Reste dû",
    value: formatMoneyPlain(cents, code),
    strong: true,
    tone: cents > 0 ? "clay" : "pine",
  }));
  if (totals.length === 0) {
    totals.push({ label: "Reste dû", value: formatMoneyPlain(0, "EUR"), strong: true, tone: "pine" });
  }
  const width = 503;
  return {
    title: "RELEVÉ",
    number: customerTitle(customer),
    stamp: null,
    seller: sellerLines(store),
    meta: [{ label: "Date", value: formatDate(today) }],
    customerLabel: "CLIENT",
    customer: partyLines(store, customerId),
    columns: [
      { label: "Facture", width: 110, align: "left" },
      { label: "Date", width: 72, align: "left" },
      { label: "Échéance", width: 72, align: "left" },
      { label: "TTC", width: 80, align: "right" },
      { label: "Réglé", width: 80, align: "right" },
      { label: "Reste", width: width - 414, align: "right" },
    ],
    rows,
    totals,
    blocks: invoices.length
      ? []
      : [{ title: "Situation", text: "Aucune facture émise pour ce client." }],
    footer: footerOf(store),
  };
}

export function creditModel(store: Store, note: CreditNote): PdfModel {
  const invoice = store.invoices.find((entry) => entry.id === note.invoiceId);
  const currency = invoice?.currencyCode || "EUR";
  const money = (cents: number) => formatMoneyPlain(cents, currency);
  const totals = documentTotals(note.lines);
  const blocks: PdfModel["blocks"] = [
    {
      title: "Imputation",
      text: `Cet avoir vient en déduction de la facture ${invoice?.number || "d'origine"}.`,
    },
  ];
  if (note.reason) blocks.push({ title: "Motif", text: note.reason });
  if (note.notes) blocks.push({ title: "Note", text: note.notes });
  return {
    title: "AVOIR",
    number: note.number,
    stamp: null,
    seller: sellerLines(store),
    meta: [
      { label: "Date", value: formatDate(note.issueDate) },
      { label: "Facture", value: invoice?.number || "—" },
    ],
    customerLabel: "ADRESSÉ À",
    customer: partyLines(store, note.customerId),
    rows: rowsFrom(note.lines, currency),
    totals: [
      { label: "Total HT", value: money(totals.ht) },
      ...totals.vatBreakdown.map((entry) => ({ label: `TVA ${vatLabel(entry.bps)}`, value: money(entry.vat) })),
      { label: "Total TTC", value: money(totals.ttc), strong: true },
    ],
    blocks,
    footer: footerOf(store),
  };
}

export function renderPdf(store: Store, model: PdfModel): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      compress: false,
      info: {
        Title: `${model.title} ${model.number}`,
        Author: store.settings.companyName,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.registerFont("Sans", SANS);
      doc.registerFont("SansBold", SANS_BOLD);
      doc.registerFont("Serif", SERIF);
      doc.registerFont("SerifBold", SERIF_BOLD);
      draw(doc, store.settings.companyName, model);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

function draw(doc: PDFKit.PDFDocument, company: string, model: PdfModel): void {
  const right = doc.page.width - MARGIN;
  const width = right - MARGIN;
  let y = MARGIN;

  doc.rect(0, 0, doc.page.width, 8).fill(PINE);

  const leftWidth = width * 0.56;
  const rightX = MARGIN + width * 0.58;
  const rightWidth = width * 0.42;

  doc.fillColor(INK).font("SerifBold").fontSize(20).text(company, MARGIN, y, { width: leftWidth });
  const companyBottom = doc.y;
  doc.font("SerifBold").fontSize(15).fillColor(PINE).text(model.title, rightX, y, { width: rightWidth, align: "right" });
  const afterTitle = Math.max(companyBottom, doc.y, y + 24);

  doc.font("Sans").fontSize(9).fillColor(MUTED);
  const sellerText = model.seller.join("\n");
  const sellerHeight = doc.heightOfString(sellerText, { width: leftWidth });
  doc.text(sellerText, MARGIN, afterTitle + 4, { width: leftWidth });

  let metaY = afterTitle + 4;
  doc.font("SansBold").fontSize(11).fillColor(INK).text(model.number, rightX, metaY, { width: rightWidth, align: "right" });
  metaY = doc.y + 4;
  for (const entry of model.meta) {
    doc.font("Sans").fontSize(8.5).fillColor(MUTED).text(entry.label, rightX, metaY, { width: rightWidth * 0.46, align: "left" });
    doc.font("Sans").fontSize(8.5).fillColor(INK).text(entry.value, rightX + rightWidth * 0.46, metaY, {
      width: rightWidth * 0.54,
      align: "right",
    });
    metaY += 13;
  }

  y = Math.max(afterTitle + sellerHeight + 18, metaY + 8);
  doc.strokeColor(PINE).lineWidth(1.4).moveTo(MARGIN, y).lineTo(right, y).stroke();
  y += 16;

  doc.font("SansBold").fontSize(8).fillColor(MUTED).text(model.customerLabel, MARGIN, y, { characterSpacing: 0.6 });
  y += 14;
  model.customer.forEach((line, index) => {
    doc.font(index === 0 ? "SansBold" : "Sans").fontSize(index === 0 ? 12 : 9.5).fillColor(INK);
    doc.text(line, MARGIN, y, { width: width * 0.7 });
    y = doc.y + 1;
  });
  y += 14;

  const columns: Column[] = model.columns ?? [
    { label: "Description", width: 210, align: "left" },
    { label: "Qté", width: 40, align: "right" },
    { label: "Unité", width: 52, align: "left" },
    { label: "PU HT", width: 70, align: "right" },
    { label: "TVA", width: 42, align: "right" },
    { label: "Montant HT", width: width - 414, align: "right" },
  ];

  const drawHeader = () => {
    doc.rect(MARGIN, y, width, 20).fill(BAND);
    let x = MARGIN;
    doc.font("SansBold").fontSize(8).fillColor(MUTED);
    for (const column of columns) {
      doc.text(column.label, x + 4, y + 6, { width: column.width - 8, align: column.align });
      x += column.width;
    }
    y += 20;
  };

  const paintFooter = () => {
    const footerY = doc.page.height - 46;
    doc.page.margins.bottom = 8;
    doc.save();
    doc.strokeColor(LINE).lineWidth(0.6).moveTo(MARGIN, footerY).lineTo(right, footerY).stroke();
    doc.font("Sans").fontSize(7).fillColor(MUTED).text(model.footer, MARGIN, footerY + 5, {
      width,
      height: 20,
      align: "center",
      lineGap: 0,
    });
    doc.restore();
  };

  const ensure = (needed: number) => {
    if (y + needed <= doc.page.height - 78) return;
    paintFooter();
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 8).fill(PINE);
    y = MARGIN;
    drawHeader();
  };

  drawHeader();

  doc.font("Sans").fontSize(9);
  model.rows.forEach((row, index) => {
    const descriptionHeight = doc.font("Sans").fontSize(9).heightOfString(row.description, { width: columns[0].width - 8 });
    const rowHeight = Math.max(descriptionHeight, 12) + 10;
    ensure(rowHeight);
    if (index % 2 === 1) doc.rect(MARGIN, y, width, rowHeight).fill("#fcfaf6");
    const values = [row.description, row.quantity, row.unit, row.unitPrice, row.vat, row.amount];
    let x = MARGIN;
    values.forEach((value, cell) => {
      doc.fillColor(INK).font(cell === 0 ? "Sans" : "Sans").fontSize(9).text(value, x + 4, y + 5, {
        width: columns[cell].width - 8,
        align: columns[cell].align,
      });
      x += columns[cell].width;
    });
    y += rowHeight;
    doc.strokeColor(LINE).lineWidth(0.4).moveTo(MARGIN, y).lineTo(right, y).stroke();
  });

  y += 14;
  const totalsHeight = model.totals.length * 16 + 8;
  ensure(totalsHeight + 10);
  const boxWidth = 240;
  const boxX = right - boxWidth;
  model.totals.forEach((total) => {
    const color = total.tone === "clay" ? CLAY : total.tone === "pine" ? PINE : INK;
    doc.font(total.strong ? "SansBold" : "Sans").fontSize(total.strong ? 11 : 9).fillColor(MUTED);
    doc.text(total.label, boxX, y, { width: 110, align: "left" });
    doc.fillColor(color).text(total.value, boxX + 110, y, { width: 130, align: "right" });
    y += total.strong ? 18 : 15;
  });

  y += 8;
  for (const block of model.blocks) {
    doc.font("Sans").fontSize(9);
    const textHeight = doc.heightOfString(block.text, { width: width - 8 });
    ensure(textHeight + 28);
    doc.font("SansBold").fontSize(8).fillColor(MUTED).text(block.title.toUpperCase(), MARGIN, y);
    y = doc.y + 3;
    doc.font("Sans").fontSize(9).fillColor(INK).text(block.text, MARGIN, y, { width });
    y = doc.y + 10;
  }

  if (model.stamp) {
    doc.save();
    doc.fillColor(model.stamp === "ANNULÉE" || model.stamp === "REFUSÉ" ? CLAY : PINE);
    doc.fillOpacity(0.13);
    doc.font("SansBold").fontSize(46);
    doc.rotate(-28, { origin: [doc.page.width / 2, 460] });
    doc.text(model.stamp, 90, 430, { lineBreak: false, width: 420, height: 54 });
    doc.restore();
  }

  paintFooter();
}
