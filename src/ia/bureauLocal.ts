declare global { interface Window { __MARCEAU_BUREAU__?: { token: string } } }
export function bureauLocalDisponible() { return typeof window !== 'undefined' && !!window.__MARCEAU_BUREAU__?.token; }
export async function appelBureau(route: string, corps?: unknown, signal?: AbortSignal): Promise<Response> {
  const token = typeof window !== 'undefined' ? window.__MARCEAU_BUREAU__?.token : undefined;
  if (!token) throw new Error('Lance le paquet Marceau Bureau pour utiliser le moteur embarqué sur PC.');
  const reponse = await fetch('/api/local/' + route, { method: corps === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Marceau-Token': token },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }), signal });
  if (!reponse.ok) { const erreur = await reponse.json().catch(() => null); throw new Error(erreur?.error || 'Le moteur local du PC est inaccessible.'); }
  return reponse;
}
