import type { Customer } from "./types.js";

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatMoneyPlain(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const euros = Math.trunc(abs / 100);
  const frac = abs % 100;
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${String(frac).padStart(2, "0")} €`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatWeekdayDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatQty(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

export function formatQtyPlain(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, frac] = rounded.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (frac === "00") return grouped;
  if (frac.endsWith("0")) return `${grouped},${frac[0]}`;
  return `${grouped},${frac}`;
}

export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

export function quantityToInput(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, frac] = rounded.toFixed(2).split(".");
  if (frac === "00") return whole;
  if (frac.endsWith("0")) return `${whole},${frac[0]}`;
  return `${whole},${frac}`;
}

export function parseDecimal(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return Math.round(value * 100) / 100;
}

export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "").replace("€", "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [euros, frac = ""] = trimmed.split(".");
  const cents = Number(euros) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isInteger(cents) || cents > 1_000_000_000) return null;
  return cents;
}

export function customerTitle(customer: Pick<Customer, "company" | "name">): string {
  return customer.company.trim() || customer.name.trim() || "Client sans nom";
}

export function customerSubtitle(customer: Pick<Customer, "company" | "name">): string {
  if (customer.company.trim() && customer.name.trim()) return customer.name.trim();
  return "";
}

export function cityLine(customer: Pick<Customer, "postalCode" | "city" | "country">): string {
  return [customer.postalCode, customer.city].filter(Boolean).join(" ") + (customer.country && customer.country !== "France" ? `, ${customer.country}` : "");
}

export function relativeDay(target: string, today: string): string {
  const days = Math.round((Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days > 1) return `dans ${days} jours`;
  if (days === -1) return "hier";
  return `il y a ${-days} jours`;
}
