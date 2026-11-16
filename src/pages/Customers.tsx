import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { cityLine, customerSubtitle, customerTitle, formatDate } from "../../shared/format";
import { documentTotals } from "../../shared/money";
import { customerBalance } from "../../shared/stats";
import type { Customer } from "../../shared/types";
import { useApp } from "../store";
import { ConfirmDialog, Field, InvoiceBadge, Missing, Money, QuoteBadge, useTitle } from "../ui";

export function CustomerList() {
  const { state } = useApp();
  useTitle("Clients");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const navigate = useNavigate();
  if (!state) return null;

  const needle = query.trim().toLowerCase();
  const rows = state.customers.filter((customer) => {
    if (filter === "active" && customer.archived) return false;
    if (filter === "archived" && !customer.archived) return false;
    if (!needle) return true;
    return `${customer.company} ${customer.name} ${customer.email} ${customer.city}`.toLowerCase().includes(needle);
  });

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Carnet</p>
          <h1>Clients</h1>
          <p className="lede">{state.customers.filter((customer) => !customer.archived).length} fiches actives</p>
        </div>
        <Link className="btn btn-primary" to="/clients/nouveau">Nouveau client</Link>
      </header>
      <div className="toolbar">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client" aria-label="Rechercher un client" />
        <div className="chips">
          {([
            ["active", "Actifs"],
            ["archived", "Archivés"],
            ["all", "Tous"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" className={filter === id ? "chip is-on" : "chip"} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="card table-wrap">
        {rows.length === 0 ? <p className="empty">Aucun client ne correspond.</p> : (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Ville</th>
                <th>E-mail</th>
                <th className="right">Solde</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => {
                const balance = customerBalance(state, customer.id);
                return (
                  <tr key={customer.id} className="clickable" onClick={() => navigate(`/clients/${customer.id}`)}>
                    <td>
                      <Link className="num" to={`/clients/${customer.id}`}>{customerTitle(customer)}</Link>
                      {customerSubtitle(customer) ? <span className="customer-sub">{customerSubtitle(customer)}</span> : null}
                      {customer.archived ? <span className="badge">Archivé</span> : null}
                    </td>
                    <td>{customer.city || "—"}</td>
                    <td>{customer.email || "—"}</td>
                    <td className="right"><span className={balance > 0 ? "money debt" : balance < 0 ? "money credit" : "money"}>{formatBalance(balance)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function formatBalance(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function CustomerForm({ mode }: { mode: "create" | "edit" }) {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  useTitle(mode === "create" ? "Nouveau client" : "Modifier le client");
  const existing = state?.customers.find((customer) => customer.id === id);
  if (!state) return null;
  if (mode === "edit" && !existing) return <Missing title="Client introuvable" to="/clients" label="Retour aux clients" />;
  return <CustomerFields customer={existing} onDone={(customerId) => navigate(`/clients/${customerId}`)} mutate={mutate} notify={notify} />;
}

function CustomerFields({
  customer,
  onDone,
  mutate,
  notify,
}: {
  customer?: Customer;
  onDone: (id: string) => void;
  mutate: ReturnType<typeof useApp>["mutate"];
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState({
    company: customer?.company ?? "",
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    postalCode: customer?.postalCode ?? "",
    city: customer?.city ?? "",
    country: customer?.country ?? "France",
    siret: customer?.siret ?? "",
    vatNumber: customer?.vatNumber ?? "",
    notes: customer?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify(form);
      if (customer) {
        await mutate(`/api/customers/${customer.id}`, { method: "PUT", body });
        notify("Client mis à jour.");
        onDone(customer.id);
      } else {
        const result = await mutate("/api/customers", { method: "POST", body });
        notify("Client créé.");
        if (result.createdId) onDone(result.createdId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to={customer ? `/clients/${customer.id}` : "/clients"}>← Clients</Link>
          <h1>{customer ? "Modifier le client" : "Nouveau client"}</h1>
        </div>
      </header>
      <form className="card" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid" style={{ marginTop: error ? 12 : 0 }}>
          <Field label="Société"><input value={form.company} onChange={set("company")} /></Field>
          <Field label="Contact"><input value={form.name} onChange={set("name")} /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Téléphone"><input value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Adresse" className="span-2"><input value={form.address} onChange={set("address")} /></Field>
          <Field label="Code postal"><input value={form.postalCode} onChange={set("postalCode")} /></Field>
          <Field label="Ville"><input value={form.city} onChange={set("city")} /></Field>
          <Field label="Pays"><input value={form.country} onChange={set("country")} /></Field>
          <Field label="SIRET"><input value={form.siret} onChange={set("siret")} /></Field>
          <Field label="Numéro de TVA"><input value={form.vatNumber} onChange={set("vatNumber")} /></Field>
          <Field label="Notes" className="span-2"><textarea value={form.notes} onChange={set("notes")} /></Field>
        </div>
        <div className="actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
          <Link className="btn btn-ghost" to={customer ? `/clients/${customer.id}` : "/clients"}>Annuler</Link>
        </div>
      </form>
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { state, mutate, notify } = useApp();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const customer = state?.customers.find((entry) => entry.id === id);
  useTitle(customer ? customerTitle(customer) : "Client");
  const used = useMemo(() => {
    if (!state || !customer) return false;
    return state.quotes.some((quote) => quote.customerId === customer.id) || state.invoices.some((invoice) => invoice.customerId === customer.id);
  }, [state, customer]);
  if (!state) return null;
  if (!customer) return <Missing title="Client introuvable" to="/clients" label="Retour aux clients" />;

  const balance = customerBalance(state, customer.id);
  const quotes = state.quotes.filter((quote) => quote.customerId === customer.id);
  const invoices = state.invoices.filter((invoice) => invoice.customerId === customer.id);

  async function remove() {
    setBusy(true);
    try {
      const result = await mutate(`/api/customers/${customer!.id}`, { method: "DELETE" });
      notify(result.archived ? "Client archivé : des pièces y sont liées." : "Client supprimé.");
      navigate("/clients");
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  async function restore() {
    await mutate(`/api/customers/${customer!.id}`, { method: "PUT", body: JSON.stringify({ ...customer, archived: false }) });
    notify("Client réactivé.");
  }

  return (
    <>
      <header className="page-head">
        <div>
          <Link className="back" to="/clients">← Clients</Link>
          <h1>{customerTitle(customer)}</h1>
          <p className="lede">{customerSubtitle(customer) || cityLine(customer) || "Fiche client"}</p>
        </div>
        <div className="actions">
          <Link className="btn btn-ghost" to={`/devis/nouveau?client=${customer.id}`}>Nouveau devis</Link>
          <Link className="btn btn-primary" to={`/factures/nouvelle?client=${customer.id}`}>Nouvelle facture</Link>
        </div>
      </header>
      <div className="identity">
        <section className="card">
          <div className="section-title">
            <h2>Coordonnées</h2>
            {customer.archived ? <span className="badge">Archivé</span> : null}
          </div>
          <dl className="dl" style={{ marginTop: 12 }}>
            <dt>E-mail</dt><dd>{customer.email || "—"}</dd>
            <dt>Téléphone</dt><dd>{customer.phone || "—"}</dd>
            <dt>Adresse</dt><dd>{[customer.address, cityLine(customer)].filter(Boolean).join(", ") || "—"}</dd>
            <dt>SIRET</dt><dd>{customer.siret || "—"}</dd>
            <dt>TVA</dt><dd>{customer.vatNumber || "—"}</dd>
            <dt>Notes</dt><dd>{customer.notes || "—"}</dd>
          </dl>
          <div className="actions" style={{ marginTop: 16 }}>
            <Link className="btn btn-ghost btn-small" to={`/clients/${customer.id}/modifier`}>Modifier</Link>
            {customer.archived ? (
              <button className="btn btn-ghost btn-small" type="button" onClick={() => restore().catch((reason: unknown) => notify(reason instanceof Error ? reason.message : "Erreur"))}>Réactiver</button>
            ) : (
              <button className="btn btn-danger btn-small" type="button" onClick={() => setConfirm(true)}>{used ? "Archiver" : "Supprimer"}</button>
            )}
          </div>
        </section>
        <section className="card">
          <h2>Solde ouvert</h2>
          <p style={{ marginTop: 10 }}><Money cents={balance} strong /></p>
          <p className="hint" style={{ marginTop: 6 }}>Somme des restes à payer sur les factures émises. Un montant négatif est à rembourser.</p>
        </section>
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <section className="card">
          <h2>Factures</h2>
          {invoices.length === 0 ? <p className="empty">Aucune facture.</p> : invoices.map((invoice) => (
            <Link className="list-link" key={invoice.id} to={`/factures/${invoice.id}`}>
              <strong>{invoice.number || "Brouillon"}</strong>
              <span className="list-meta"><InvoiceBadge state={state} invoice={invoice} /></span>
              <small>{formatDate(invoice.issueDate)}</small>
              <span className="list-meta"><Money cents={documentTotals(invoice.lines).ttc} /></span>
            </Link>
          ))}
        </section>
        <section className="card">
          <h2>Devis</h2>
          {quotes.length === 0 ? <p className="empty">Aucun devis.</p> : quotes.map((quote) => (
            <Link className="list-link" key={quote.id} to={`/devis/${quote.id}`}>
              <strong>{quote.number}</strong>
              <span className="list-meta"><QuoteBadge state={state} quote={quote} /></span>
              <small>{formatDate(quote.issueDate)}</small>
              <span className="list-meta"><Money cents={documentTotals(quote.lines).ttc} /></span>
            </Link>
          ))}
        </section>
      </div>
      {confirm ? (
        <ConfirmDialog
          title={used ? "Archiver ce client ?" : "Supprimer ce client ?"}
          body={used ? "Les pièces déjà émises restent en place. Le client disparaît des listes de sélection." : "La fiche sera effacée."}
          confirmLabel={used ? "Archiver" : "Supprimer"}
          danger
          busy={busy}
          onClose={() => setConfirm(false)}
          onConfirm={() => remove().catch(() => setConfirm(false))}
        />
      ) : null}
    </>
  );
}
