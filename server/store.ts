import fs from "node:fs";
import path from "node:path";
import { systemClock } from "../shared/clock.js";
import type { Store } from "../shared/types.js";
import { normalizeStore } from "./normalize.js";
import { seedStore } from "./seed.js";

const PRIVATE_FILE = "/private/atrium-store.json";

function localFile(): string {
  return path.join(process.cwd(), "data", "store.json");
}

function privateWritable(): boolean {
  try {
    if (!fs.existsSync("/private")) return false;
    const probe = "/private/.atrium-probe";
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function richness(store: Store): number {
  const imported = store.customers.filter((row) => row.zohoId).length;
  return imported * 1_000_000 + store.invoices.length * 1_000 + store.customers.length;
}

const durable = privateWritable();
const file = process.env.STORE_FILE || (durable ? PRIVATE_FILE : localFile());

function isStore(value: unknown): value is Store {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<Store>;
  return (
    store.version === 1 &&
    !!store.settings &&
    Array.isArray(store.customers) &&
    Array.isArray(store.items) &&
    Array.isArray(store.quotes) &&
    Array.isArray(store.invoices) &&
    Array.isArray(store.creditNotes) &&
    Array.isArray(store.payments)
  );
}

function atomicWrite(store: Store): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

function readStoreFile(candidate: string): Store | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(candidate, "utf8"));
    if (!isStore(parsed)) return null;
    return normalizeStore(parsed);
  } catch {
    return null;
  }
}

function load(): Store {
  const candidates = [process.env.STORE_FILE, PRIVATE_FILE, localFile()].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  let best: Store | null = null;
  for (const candidate of candidates) {
    const found = readStoreFile(candidate);
    if (found && (!best || richness(found) > richness(best))) best = found;
  }
  if (!best) {
    console.error("Magasin absent, chargement des données de démonstration.");
    best = seedStore(systemClock());
  }
  const serialized = JSON.stringify(best, null, 2);
  let current = "";
  try {
    current = fs.readFileSync(file, "utf8");
  } catch {
    current = "";
  }
  if (current !== serialized) atomicWrite(best);
  console.log(durable || file.startsWith("/private/") ? "Magasin : stockage privé" : "Magasin : dossier de l'application");
  return best;
}

let state = load();

export function storageReport(): { location: "private" | "app"; company: string; customers: number; invoices: number } {
  return {
    location: file.startsWith("/private/") ? "private" : "app",
    company: state.settings.companyName,
    customers: state.customers.length,
    invoices: state.invoices.length,
  };
}

export function readStore(): Store {
  return state;
}

export function saveStore(next: Store): Store {
  state = next;
  atomicWrite(state);
  return state;
}

export function resetStore(): Store {
  const current = readStore();
  const seeded = seedStore(systemClock());
  return saveStore({
    ...seeded,
    zoho: {
      ...current.zoho,
      lastImport: null,
      lastImportAt: "",
      lastError: "",
      ignoredIds: [],
    },
  });
}
