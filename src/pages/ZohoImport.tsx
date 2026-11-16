import { useEffect, useState } from "react";
import { DATA_CENTERS, HOME_URL, REDIRECT_URI, ZOHO_SCOPES } from "../../shared/zoho-public";
import type { DataCenterId, ImportReport, ImportTally } from "../../shared/types";
import { vatLabel } from "../../shared/money";
import { useApp } from "../store";
import { Field, useTitle } from "../ui";

const TALLY_ROWS: { key: keyof Omit<ImportReport, "errors">; label: string }[] = [
  { key: "customers", label: "Clients" },
  { key: "items", label: "Articles" },
  { key: "quotes", label: "Devis" },
  { key: "invoices", label: "Factures" },
  { key: "payments", label: "Paiements" },
  { key: "taxes", label: "Taxes" },
  { key: "currencies", label: "Devises" },
];

export function ZohoImportPage() {
  const { state, mutate, notify } = useApp();
  useTitle("Import Zoho");
  const zoho = state?.zoho;
  const [dataCenter, setDataCenter] = useState<DataCenterId>(zoho?.dataCenter ?? "eu");
  const [clientId, setClientId] = useState(zoho?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [organizationId, setOrganizationId] = useState(zoho?.organizationId ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!zoho) return;
    setDataCenter(zoho.dataCenter);
    setClientId(zoho.clientId);
    setOrganizationId(zoho.organizationId);
  }, [zoho]);

  if (!state || !zoho) return null;
  const center = DATA_CENTERS.find((entry) => entry.id === dataCenter) ?? DATA_CENTERS[0];
  const saved = zoho.clientId.length > 0 && zoho.hasClientSecret;

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L'opération a échoué.");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <p className="kicker">Zoho Invoice</p>
          <h1>Import</h1>
          <p className="lede">
            Lecture seule. Relancer l'import met à jour les fiches qui n'ont pas été modifiées ici, et laisse intactes celles que vous avez éditées, archivées ou supprimées.
          </p>
        </div>
      </header>

      {error || zoho.lastError ? <p className="form-error" role="alert">{error || zoho.lastError}</p> : null}

      <section className="card">
        <h2>Créer le client dans Zoho</h2>
        <ol className="steps">
          <li>
            Ouvrez la console API du centre où se trouve votre organisation Zoho Invoice :{" "}
            <a href={center.console} target="_blank" rel="noreferrer">{center.console}</a>
            {" "}({center.label}).
          </li>
          <li>
            Créez un client de type <strong>Server-based Applications</strong> (applications basées sur le serveur). Nom suggéré : Facturation locale.
          </li>
          <li>
            URL de la page d'accueil : <span className="mono">{HOME_URL}</span>
          </li>
          <li>
            URI de redirection autorisée, à l'identique : <span className="mono">{REDIRECT_URI}</span>
            <button
              className="btn btn-ghost btn-small"
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => navigator.clipboard.writeText(REDIRECT_URI).then(() => notify("Adresse de redirection copiée.")).catch(() => notify(REDIRECT_URI))}
            >
              Copier
            </button>
          </li>
          <li>Le compte Zoho qui se connectera doit pouvoir lire l'organisation Invoice.</li>
          <li>Copiez l'identifiant client et le secret dans le formulaire ci-dessous. Ils restent dans le fichier local de cette machine.</li>
        </ol>
        <p className="hint" style={{ marginTop: 10 }}>
          L'application demande uniquement ces droits de lecture : {ZOHO_SCOPES}. Elle ne modifie rien dans Zoho.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Identifiants</h2>
        <form
          className="form-grid"
          style={{ marginTop: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            run("save", async () => {
              await mutate("/api/zoho/config", {
                method: "POST",
                body: JSON.stringify({ dataCenter, clientId, clientSecret }),
              });
              setClientSecret("");
              notify("Identifiants enregistrés sur cette machine.");
            }).catch(() => undefined);
          }}
        >
          <Field label="Centre de données">
            <select value={dataCenter} onChange={(event) => setDataCenter(event.target.value as DataCenterId)}>
              {DATA_CENTERS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Identifiant client">
            <input value={clientId} autoComplete="off" onChange={(event) => setClientId(event.target.value)} />
          </Field>
          <Field className="span-2" label="Secret client" hint={zoho.hasClientSecret ? "Un secret est déjà enregistré. Laissez vide pour le conserver." : "Collez le secret ici. Il n'est pas renvoyé par l'application."}>
            <input
              type="password"
              value={clientSecret}
              autoComplete="new-password"
              onChange={(event) => setClientSecret(event.target.value)}
            />
          </Field>
          <div className="actions span-2">
            <button className="btn btn-primary" type="submit" disabled={busy !== ""}>
              {busy === "save" ? "Enregistrement…" : "Enregistrer"}
            </button>
            {saved ? <a className="btn btn-ghost" href="/api/zoho/start">Se connecter à Zoho</a> : null}
          </div>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Organisation et import</h2>
        {zoho.connected ? (
          <>
            <p className="hint" style={{ marginTop: 8 }}>
              Connecté{zoho.organizationName ? ` · ${zoho.organizationName}` : ""}. Les fiches de démonstration restent à côté des fiches Zoho. Une fiche déjà modifiée ici n'est pas écrasée. Une fiche importée puis supprimée ici n'est pas recréée.
            </p>
            {zoho.organizations.length > 1 ? (
              <div className="actions" style={{ marginTop: 12 }}>
                <label className="field" style={{ minWidth: 240 }}>
                  <span>Organisation</span>
                  <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                    <option value="">Choisir…</option>
                    {zoho.organizations.map((org) => (
                      <option key={org.organizationId} value={org.organizationId}>{org.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy !== "" || !organizationId}
                  onClick={() => run("org", async () => {
                    await mutate("/api/zoho/organization", { method: "POST", body: JSON.stringify({ organizationId }) });
                    notify("Organisation retenue.");
                  })}
                >
                  Utiliser cette organisation
                </button>
              </div>
            ) : null}
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy !== "" || !zoho.organizationId}
                onClick={() => run("import", async () => {
                  await mutate("/api/zoho/import", { method: "POST" });
                  notify("Import terminé.");
                })}
              >
                {busy === "import" ? "Import en cours…" : "Importer"}
              </button>
              <button className="btn btn-ghost" type="button" disabled={busy !== ""} onClick={() => run("off", async () => {
                await mutate("/api/zoho/disconnect", { method: "POST" });
                notify("Zoho est déconnecté. Les identifiants restent enregistrés.");
              })}>
                Déconnecter
              </button>
            </div>
            {!zoho.organizationId ? <p className="hint">Choisissez une organisation avant d'importer.</p> : null}
          </>
        ) : (
          <p className="hint" style={{ marginTop: 8 }}>Enregistrez les identifiants, puis connectez-vous avec le compte qui lit l'organisation.</p>
        )}
        {zoho.lastImport ? <Report report={zoho.lastImport} at={zoho.lastImportAt} /> : null}
      </section>

      {state.currencies.length > 0 || state.taxes.length > 0 ? (
        <div className="split" style={{ marginTop: 16 }}>
          <section className="card">
            <h2>Devises</h2>
            {state.currencies.length === 0 ? <p className="empty">Aucune devise importée.</p> : (
              <table>
                <tbody>
                  {state.currencies.map((currency) => (
                    <tr key={currency.id}>
                      <td>{currency.code}</td>
                      <td>{currency.name}</td>
                      <td>{currency.isBase ? "Devise de base" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card">
            <h2>Taxes</h2>
            {state.taxes.length === 0 ? <p className="empty">Aucune taxe importée.</p> : (
              <table>
                <tbody>
                  {state.taxes.map((tax) => (
                    <tr key={tax.id}>
                      <td>{tax.name}</td>
                      <td className="right">{vatLabel(tax.rateBps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : null}

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Oublier les identifiants</h2>
        <p className="hint" style={{ marginTop: 8 }}>Retire l'identifiant, le secret et les jetons de cette machine. Les fiches déjà importées restent.</p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="btn btn-danger" type="button" disabled={busy !== ""} onClick={() => run("forget", async () => {
            await mutate("/api/zoho/forget", { method: "POST" });
            setClientId("");
            setClientSecret("");
            notify("Identifiants Zoho oubliés.");
          })}>
            Oublier l'identifiant
          </button>
        </div>
      </section>
    </>
  );
}

function Report({ report, at }: { report: ImportReport; at: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Dernier import{at ? ` · ${new Date(at).toLocaleString("fr-FR")}` : ""}</h3>
      <table className="tally">
        <thead>
          <tr>
            <th>Fiches</th>
            <th className="right">Créées</th>
            <th className="right">Mises à jour</th>
            <th className="right">Inchangées</th>
            <th className="right">Ignorées</th>
          </tr>
        </thead>
        <tbody>
          {TALLY_ROWS.map((row) => {
            const tally: ImportTally = report[row.key];
            return (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className="right">{tally.created}</td>
                <td className="right">{tally.updated}</td>
                <td className="right">{tally.unchanged}</td>
                <td className="right">{tally.skipped}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {report.errors.length > 0 ? (
        <ul className="steps">
          {report.errors.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
