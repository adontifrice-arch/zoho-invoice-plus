import { useState } from "react";
import type { FormEvent } from "react";
import { formatMoney } from "../../shared/format";
import { vatLabel } from "../../shared/money";
import { UNITS, VAT_RATES } from "../../shared/types";
import type { Item } from "../../shared/types";
import { centsToInput, parseMoneyToCents } from "../../shared/format";
import { useApp } from "../store";
import { ConfirmDialog, Field, useTitle } from "../ui";

type Draft = {
  name: string;
  sku: string;
  description: string;
  unitPrice: string;
  unit: string;
  vatBps: number;
  active: boolean;
};

const emptyDraft = (vatBps: number): Draft => ({
  name: "",
  sku: "",
  description: "",
  unitPrice: "",
  unit: "heure",
  vatBps,
  active: true,
});

export function ItemList() {
  const { state, mutate, notify } = useApp();
  useTitle("Articles");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  if (!state) return null;

  const needle = query.trim().toLowerCase();
  const rows = state.items.filter((item) => {
    if (!showAll && !item.active) return false;
    if (!needle) return true;
    return `${item.name} ${item.sku} ${item.description}`.toLowerCase().includes(needle);
  });

  async function remove(item: Item) {
    setBusy(true);
    try {
      const result = await mutate(`/api/items/${item.id}`, { method: "DELETE" });
      notify(result.archived ? "Article désactivé : il figure déjà sur des pièces." : "Article supprimé.");
      setConfirm(null);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Catalogue</p>
          <h1>Articles</h1>
          <p className="lede">Prix hors taxes, repris dans les devis et les factures.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setEditing("new")}>Nouvel article</button>
      </header>
      <div className="toolbar">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un article" aria-label="Rechercher un article" />
        <button type="button" className={showAll ? "chip is-on" : "chip"} onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Tous les articles" : "Articles actifs"}
        </button>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucun article ne correspond.</p> : (
          <table>
            <thead>
              <tr>
                <th>Article</th>
                <th>Réf.</th>
                <th>Unité</th>
                <th>TVA</th>
                <th className="right">Prix HT</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <button className="num" type="button" onClick={() => setEditing(item)} style={{ background: "none", border: 0, padding: 0 }}>
                      {item.name}
                    </button>
                    {item.description ? <span className="customer-sub">{item.description}</span> : null}
                    {!item.active ? <span className="badge">Inactif</span> : null}
                  </td>
                  <td>{item.sku || "—"}</td>
                  <td>{item.unit}</td>
                  <td>{vatLabel(item.vatBps)}</td>
                  <td className="right money">{formatMoney(item.unitPriceCents)}</td>
                  <td className="right">
                    <button className="btn btn-ghost btn-small" type="button" onClick={() => setEditing(item)}>Modifier</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing ? (
        <ItemDialog
          item={editing === "new" ? undefined : editing}
          defaultVat={state.settings.defaultVatBps}
          onClose={() => setEditing(null)}
          onDelete={(item) => {
            setEditing(null);
            setConfirm(item);
          }}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title="Retirer cet article ?"
          body="S'il est déjà utilisé, il sera seulement désactivé."
          confirmLabel="Retirer"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={() => remove(confirm)}
        />
      ) : null}
    </>
  );
}

function ItemDialog({
  item,
  defaultVat,
  onClose,
  onDelete,
}: {
  item?: Item;
  defaultVat: number;
  onClose: () => void;
  onDelete: (item: Item) => void;
}) {
  const { mutate, notify } = useApp();
  const [form, setForm] = useState<Draft>(item ? {
    name: item.name,
    sku: item.sku,
    description: item.description,
    unitPrice: centsToInput(item.unitPriceCents),
    unit: item.unit,
    vatBps: item.vatBps,
    active: item.active,
  } : emptyDraft(defaultVat));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const units = UNITS.includes(form.unit as (typeof UNITS)[number]) ? [...UNITS] : [form.unit, ...UNITS];

  async function submit(event: FormEvent) {
    event.preventDefault();
    const unitPriceCents = parseMoneyToCents(form.unitPrice);
    if (!form.name.trim()) {
      setError("L'article doit avoir un nom.");
      return;
    }
    if (unitPriceCents == null) {
      setError("Indiquez un prix hors taxes, par exemple 95,00.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: form.name,
        sku: form.sku,
        description: form.description,
        unit: form.unit,
        unitPriceCents,
        vatBps: form.vatBps,
        active: form.active,
      });
      if (item) {
        await mutate(`/api/items/${item.id}`, { method: "PUT", body });
        notify("Article mis à jour.");
      } else {
        await mutate("/api/items", { method: "POST", body });
        notify("Article créé.");
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>{item ? "Modifier l'article" : "Nouvel article"}</h2>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="Nom" className="span-2"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Référence"><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>
          <Field label="Prix HT"><input value={form.unitPrice} inputMode="decimal" placeholder="0,00" onChange={(event) => setForm({ ...form, unitPrice: event.target.value })} /></Field>
          <Field label="Unité">
            <select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </Field>
          <Field label="TVA">
            <select value={form.vatBps} onChange={(event) => setForm({ ...form, vatBps: Number(event.target.value) })}>
              {VAT_RATES.map((rate) => <option key={rate.bps} value={rate.bps}>{rate.label}</option>)}
            </select>
          </Field>
          <Field label="Description" className="span-2">
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Article actif
        </label>
        <div className="actions" style={{ marginTop: 16 }}>
          {item ? <button className="btn btn-danger" type="button" onClick={() => onDelete(item)}>Retirer</button> : null}
          <button className="btn btn-ghost" type="button" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </form>
    </div>
  );
}
