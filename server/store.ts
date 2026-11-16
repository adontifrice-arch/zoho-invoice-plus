import fs from "node:fs";
import path from "node:path";
import { systemClock } from "../shared/clock.js";
import type { Store } from "../shared/types.js";
import { normalizeStore } from "./normalize.js";
import { seedStore } from "./seed.js";

function resolveStoreFile(): string {
  const override = process.env.STORE_FILE;
  if (override) return override;
  const durable = "/private/atrium-store.json";
  const local = path.join(process.cwd(), "data", "store.json");
  if (fs.existsSync(durable)) return durable;
  if (fs.existsSync(local)) return local;
  if (fs.existsSync("/private")) return durable;
  return local;
}

const file = resolveStoreFile();

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

function load(): Store {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!isStore(parsed)) throw new Error("invalid store");
    const normalized = normalizeStore(parsed);
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) atomicWrite(normalized);
    return normalized;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.error("Magasin illisible, rechargement des données de démonstration.");
    }
    const seeded = seedStore(systemClock());
    atomicWrite(seeded);
    return seeded;
  }
}

let state = load();

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
