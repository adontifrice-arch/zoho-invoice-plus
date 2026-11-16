import type { Line, LineInput, Item } from "../shared/types";
import { UNITS, VAT_RATES } from "../shared/types";
import { centsToInput, formatMoney, parseDecimal, parseMoneyToCents, quantityToInput } from "../shared/format";
import { documentTotals, lineAmounts, vatLabel } from "../shared/money";

export type DraftLine = {
  key: string;
  itemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatBps: number;
};

export function blankLine(vatBps: number): DraftLine {
  return {
    key: crypto.randomUUID(),
    itemId: null,
    description: "",
    quantity: "1",
    unit: "heure",
    unitPrice: "",
    vatBps,
  };
}

export function lineToDraft(line: Line): DraftLine {
  return {
    key: line.id,
    itemId: line.itemId,
    description: line.description,
    quantity: quantityToInput(line.quantity),
    unit: line.unit,
    unitPrice: centsToInput(line.unitPriceCents),
    vatBps: line.vatBps,
  };
}

export function readLines(lines: DraftLine[]): { ok: true; lines: LineInput[] } | { ok: false; error: string } {
  if (lines.length === 0) return { ok: false, error: "Ajoutez au moins une ligne." };
  const parsed: LineInput[] = [];
  for (const line of lines) {
    if (!line.description.trim()) return { ok: false, error: "Chaque ligne doit avoir une description." };
    const quantity = parseDecimal(line.quantity);
    if (quantity == null) return { ok: false, error: "Vérifiez les quantités : un nombre positif, deux décimales au plus." };
    const unitPriceCents = parseMoneyToCents(line.unitPrice);
    if (unitPriceCents == null) return { ok: false, error: "Vérifiez les prix unitaires, par exemple 120,00." };
    if (!line.unit.trim()) return { ok: false, error: "Chaque ligne doit avoir une unité." };
    parsed.push({
      itemId: line.itemId,
      description: line.description.trim(),
      quantity,
      unit: line.unit.trim(),
      unitPriceCents,
      vatBps: line.vatBps,
    });
  }
  return { ok: true, lines: parsed };
}

export function previewTotals(lines: DraftLine[]) {
  const valid: Line[] = [];
  let incomplete = false;
  for (const line of lines) {
    const quantity = parseDecimal(line.quantity);
    const unitPriceCents = parseMoneyToCents(line.unitPrice);
    if (!line.description.trim() || quantity == null || unitPriceCents == null) {
      incomplete = true;
      continue;
    }
    valid.push({
      id: line.key,
      itemId: line.itemId,
      description: line.description,
      quantity,
      unit: line.unit,
      unitPriceCents,
      vatBps: line.vatBps,
    });
  }
  return { incomplete, totals: documentTotals(valid) };
}

export function LineEditor({
  items,
  lines,
  onChange,
  defaultVat = 2000,
}: {
  items: Item[];
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  defaultVat?: number;
}) {
  const update = (key: string, patch: Partial<DraftLine>) => {
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const addItem = (itemId: string) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) return;
    onChange([
      ...lines,
      {
        key: crypto.randomUUID(),
        itemId: item.id,
        description: item.description ? `${item.name}\n${item.description}` : item.name,
        quantity: "1",
        unit: item.unit,
        unitPrice: centsToInput(item.unitPriceCents),
        vatBps: item.vatBps,
      },
    ]);
  };

  return (
    <div className="lines">
      <div className="lines-add">
        <select
          aria-label="Ajouter un article"
          value=""
          onChange={(event) => {
            addItem(event.target.value);
            event.target.value = "";
          }}
        >
          <option value="">Ajouter un article…</option>
          {items.filter((item) => item.active).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} — {formatMoney(item.unitPriceCents)}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost" type="button" onClick={() => onChange([...lines, blankLine(defaultVat)])}>
          Ligne libre
        </button>
      </div>
      {lines.map((line) => {
        const quantity = parseDecimal(line.quantity);
        const price = parseMoneyToCents(line.unitPrice);
        const amount = quantity != null && price != null ? lineAmounts({ quantity, unitPriceCents: price, vatBps: line.vatBps }).ht : null;
        const units = UNITS.includes(line.unit as (typeof UNITS)[number]) ? [...UNITS] : [line.unit, ...UNITS];
        return (
          <div className="line-card" key={line.key}>
            <textarea
              aria-label="Description"
              value={line.description}
              onChange={(event) => update(line.key, { description: event.target.value })}
              placeholder="Description de la prestation"
            />
            <div className="line-grid">
              <label>
                Qté
                <input value={line.quantity} inputMode="decimal" onChange={(event) => update(line.key, { quantity: event.target.value })} />
              </label>
              <label>
                Unité
                <select value={line.unit} onChange={(event) => update(line.key, { unit: event.target.value })}>
                  {units.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label>
                PU HT
                <input value={line.unitPrice} inputMode="decimal" placeholder="0,00" onChange={(event) => update(line.key, { unitPrice: event.target.value })} />
              </label>
              <label>
                TVA
                <select value={line.vatBps} onChange={(event) => update(line.key, { vatBps: Number(event.target.value) })}>
                  {(VAT_RATES.some((rate) => rate.bps === line.vatBps) ? VAT_RATES : [...VAT_RATES, { bps: line.vatBps, label: vatLabel(line.vatBps) }]).map((rate) => (
                    <option key={rate.bps} value={rate.bps}>{rate.label}</option>
                  ))}
                </select>
              </label>
              <div className="line-total">{amount == null ? "—" : formatMoney(amount)}</div>
              <button className="icon-btn" type="button" aria-label="Retirer la ligne" onClick={() => onChange(lines.filter((entry) => entry.key !== line.key))}>
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
