export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  let data: { error?: string } = {};
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      if (!response.ok) {
        if (response.status === 502 || response.status === 503 || /bad gateway/i.test(text)) {
          throw new Error("Le serveur mail est inaccessible (SMTP bloqué ou indisponible). Vérifiez les secrets SMTP GoDaddy.");
        }
        throw new Error("Réponse illisible du serveur.");
      }
    }
  }
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data as T;
}
