import { fetch as fetchExpo } from 'expo/fetch';

export type ResultatWeb = { titre: string; url: string; domaine: string; extrait: string };

function urlHttp(valeur: string): URL {
  const url = new URL(valeur.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Utilise une adresse HTTP ou HTTPS sans identifiants.');
  }
  return url;
}

export function endpointRecherche(adresse: string): URL {
  const url = urlHttp(adresse);
  const chemin = url.pathname.replace(/\/+$/, '');
  const recherche = chemin.endsWith('/search') ? chemin : `${chemin}/search`;
  return new URL(`${url.origin}${recherche}`);
}

async function lireReponse(reponse: Awaited<ReturnType<typeof fetchExpo>>, limite: number) {
  const lecteur = reponse.body?.getReader();
  if (!lecteur) throw new Error('Réponse vide.');
  const octets = new Uint8Array(limite);
  let longueur = 0;
  try {
    while (true) {
      const { done, value } = await lecteur.read();
      if (done) return new TextDecoder().decode(octets.subarray(0, longueur));
      if (longueur + value.length > limite) throw new Error('La réponse dépasse la taille maximale.');
      octets.set(value, longueur);
      longueur += value.length;
    }
  } finally {
    await lecteur.cancel().catch(() => {});
    lecteur.releaseLock();
  }
}

const ENTITES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à',
};

export function texteHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|noscript|svg|template|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/?(?:p|h[1-6]|li|br|article|section|div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entite, cle: string) => {
      if (!cle.startsWith('#')) return ENTITES[cle] ?? entite;
      const point = /^#x/i.test(cle) ? parseInt(cle.slice(2), 16) : Number(cle.slice(1));
      return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : entite;
    })
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function rechercherWeb(adresse: string, mots: string, signal: AbortSignal): Promise<ResultatWeb[]> {
  let url: URL;
  try {
    url = endpointRecherche(adresse);
  } catch {
    throw new Error('Entre une adresse SearXNG valide.');
  }
  url.searchParams.set('q', mots);
  url.searchParams.set('format', 'json');
  const reponse = await fetchExpo(url.toString(), {
    signal, credentials: 'omit', headers: { Accept: 'application/json' },
  }).catch(() => { throw new Error('Impossible de joindre SearXNG. Vérifie son adresse et ta connexion.'); });
  if (reponse.status === 403) throw new Error('SearXNG a refusé la recherche. Vérifie que le format JSON est activé.');
  if (!reponse.ok) throw new Error(`Erreur SearXNG (${reponse.status}).`);
  const brut = await lireReponse(reponse, 512 * 1024);
  let donnees: { results?: unknown[] };
  try {
    donnees = JSON.parse(brut);
  } catch {
    throw new Error('SearXNG a renvoyé une réponse qui ne peut pas être lue en JSON.');
  }
  if (!Array.isArray(donnees?.results)) throw new Error('SearXNG a renvoyé un format inattendu.');
  const resultats = new Map<string, ResultatWeb>();
  for (const entree of donnees.results) {
    if (!entree || typeof entree !== 'object' || !('url' in entree) || typeof entree.url !== 'string') continue;
    let lien: URL;
    try {
      lien = urlHttp(entree.url);
    } catch {
      continue;
    }
    const titre = 'title' in entree && typeof entree.title === 'string' ? texteHtml(entree.title) : '';
    const extrait = 'content' in entree && typeof entree.content === 'string' ? texteHtml(entree.content) : '';
    if (!resultats.has(lien.href)) {
      resultats.set(lien.href, {
        titre: titre.slice(0, 240) || lien.hostname,
        url: lien.href,
        domaine: lien.hostname,
        extrait: extrait.slice(0, 500),
      });
    }
    if (resultats.size >= 12) break;
  }
  return [...resultats.values()];
}

export async function lirePageWeb(adresse: string, signal: AbortSignal) {
  const url = urlHttp(adresse);
  const reponse = await fetchExpo(url.toString(), {
    signal, credentials: 'omit', headers: { Accept: 'text/html, text/plain' },
  }).catch(() => { throw new Error('La page ne peut pas être chargée ici. Tu peux ouvrir le lien original.'); });
  if (!reponse.ok) throw new Error(`Le site a renvoyé une erreur (${reponse.status}).`);
  const type = reponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!type || !['text/html', 'text/plain', 'application/xhtml+xml'].includes(type)) {
    throw new Error('Cette page ne fournit pas de texte lisible dans Marceau.');
  }
  const contenu = await lireReponse(reponse, 1024 * 1024);
  const texte = type === 'text/plain' ? contenu.trim() : texteHtml(contenu);
  if (!texte) throw new Error('Aucun texte trouvé dans cette page.');
  return texte.slice(0, 12000);
}
