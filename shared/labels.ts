import type { InvoiceViewStatus, QuoteStatus } from "./types.js";
import { PAYMENT_METHODS } from "./types.js";
import type { PaymentMethod } from "./types.js";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  refused: "Refusé",
  invoiced: "Facturé",
};

export function invoiceStatusLabel(status: InvoiceViewStatus, dueCents = 0): string {
  if (status === "paid" && dueCents < 0) return "À rembourser";
  switch (status) {
    case "draft":
      return "Brouillon";
    case "issued":
      return "Émise";
    case "partial":
      return "Partielle";
    case "overdue":
      return "En retard";
    case "paid":
      return "Payée";
    case "void":
      return "Annulée";
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  return PAYMENT_METHODS.find((entry) => entry.id === method)?.label ?? method;
}
