import type { Fichier } from '../types';

/** Import d'un dépôt GitHub dans un projet Codex. */

const MAX_FICHIERS = 200;
const MAX_TAILLE_FICHIER = 150_000; // octets
const MAX_TAILLE_TOTALE = 2_500_000;

const DOSSIERS_IGNORES =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.expo|\.gradle|Pods|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode)\//;
const FICHIERS_IGNORES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.min\.(js|css)|\.map)$/i;
const EXTENSIONS_TEXTE =
  /\.(txt|md|markdown|json|jsonc|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|java|kt|kts|swift|c|h|cpp|hpp|cs|go|rs|dart|lua|sh|bash|zsh|ps1|bat|sql|yml|yaml|toml|ini|cfg|conf|gradle|properties|vue|svelte|astro|tex|csv|env\.example|gitignore|editorconfig|prettierrc|eslintrc)$|(^|\/)(Dockerfile|Makefile|LICENSE|README|Procfile|CLAUDE\.md|AGENTS\.md)$/i;

export type ResultatImport = {
  nom: string;
  description: string;
  branche: string;
  fichiers: Fichier[];
  ignores: number;
};

/** Lit « github.com/proprio/depot[/tree/branche] » ou « proprio/depot ». */
export function lireAdresse(adresse: string): { proprio: string; depot: string; branche?: string } | null {
  const propre = adresse.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m =
    propre.match(/github\.com[/:]([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^\s#?]+))?/i) ??
    propre.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { proprio: m[1], depot: m[2], branche: m[3] ? decodeURIComponent(m[3]) : undefined };
}

async function api<T>(url: string, jeton?: string): Promise<T> {
  const reponse = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(jeton?.trim() ? { Authorization: `Bearer ${jeton.trim()}` } : {}),
    },
  });
  if (reponse.status === 404) throw new Error('Dépôt introuvable. Vérifie l’adresse (ou ajoute un jeton s’il est privé).');
  if (reponse.status === 401) throw new Error('Jeton GitHub refusé.');
  if (reponse.status === 403 || reponse.status === 429) {
    throw new Error('Limite de GitHub atteinte (60 demandes par heure sans jeton). Réessaie plus tard ou ajoute un jeton.');
  }
  if (!reponse.ok) throw new Error(`Erreur GitHub ${reponse.status}.`);
  return reponse.json() as Promise<T>;
}

/**
 * Trouve le commit d'une référence écrite après « /tree/ ». Une branche peut contenir des
 * « / » (feature/foo) et l'adresse peut continuer vers un dossier : on essaie du plus long
 * au plus court jusqu'à trouver une branche, un tag ou un commit qui existe.
 */
async function resoudreReference(
  proprio: string,
  depot: string,
  reference: string,
  jeton?: string,
): Promise<{ branche: string; commit: string; arbre: string }> {
  const morceaux = reference.split('/').filter(Boolean);
  for (let n = morceaux.length; n >= 1; n--) {
    const essai = morceaux.slice(0, n).join('/');
    const r = await fetch(`https://api.github.com/repos/${proprio}/${depot}/commits/${encodeURIComponent(essai)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(jeton?.trim() ? { Authorization: `Bearer ${jeton.trim()}` } : {}),
      },
    });
    if (r.status === 404 || r.status === 422) continue;
    if (r.status === 401) throw new Error('Jeton GitHub refusé.');
    if (r.status === 403 || r.status === 429) {
      throw new Error('Limite de GitHub atteinte (60 demandes par heure sans jeton). Réessaie plus tard ou ajoute un jeton.');
    }
    if (!r.ok) throw new Error(`Erreur GitHub ${r.status}.`);
    const j = (await r.json()) as { sha: string; commit: { tree: { sha: string } } };
    return { branche: essai, commit: j.sha, arbre: j.commit.tree.sha };
  }
  throw new Error(`Branche introuvable : « ${reference} ».`);
}

/** Télécharge les fichiers texte d'un dépôt GitHub (public, ou privé avec un jeton). */
export async function importerDepot(
  adresse: string,
  jeton?: string,
  progression?: (fait: number, total: number) => void,
): Promise<ResultatImport> {
  const lu = lireAdresse(adresse);
  if (!lu) throw new Error('Adresse GitHub invalide. Exemple : github.com/proprio/depot');
  const { proprio, depot } = lu;

  const infos = await api<{ default_branch: string; description: string | null; name: string }>(
    `https://api.github.com/repos/${proprio}/${depot}`,
    jeton,
  );
  const ref = await resoudreReference(proprio, depot, lu.branche ?? infos.default_branch, jeton);
  const branche = ref.branche;
  const arbre = await api<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `https://api.github.com/repos/${proprio}/${depot}/git/trees/${ref.arbre}?recursive=1`,
    jeton,
  );

  const candidats = arbre.tree.filter(
    (e) =>
      e.type === 'blob' &&
      !DOSSIERS_IGNORES.test(`${e.path}`) &&
      !FICHIERS_IGNORES.test(e.path) &&
      EXTENSIONS_TEXTE.test(e.path) &&
      (e.size ?? 0) <= MAX_TAILLE_FICHIER,
  );
  // Les fichiers les plus importants d'abord (racine, README, config), puis les plus petits
  candidats.sort((a, b) => a.path.split('/').length - b.path.split('/').length || (a.size ?? 0) - (b.size ?? 0));

  const choisis: typeof candidats = [];
  let total = 0;
  for (const e of candidats) {
    if (choisis.length >= MAX_FICHIERS || total + (e.size ?? 0) > MAX_TAILLE_TOTALE) break;
    choisis.push(e);
    total += e.size ?? 0;
  }

  const fichiers: Fichier[] = [];
  let fait = 0;
  const maintenant = Date.now();
  const brut = (chemin: string) =>
    `https://raw.githubusercontent.com/${proprio}/${depot}/${ref.commit}/${chemin
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;

  // Téléchargement par petits groupes
  for (let i = 0; i < choisis.length; i += 8) {
    const groupe = choisis.slice(i, i + 8);
    const contenus = await Promise.all(
      groupe.map(async (e) => {
        try {
          const r = await fetch(brut(e.path), jeton?.trim() ? { headers: { Authorization: `Bearer ${jeton.trim()}` } } : undefined);
          return r.ok ? await r.text() : null;
        } catch {
          return null;
        }
      }),
    );
    groupe.forEach((e, k) => {
      const contenu = contenus[k];
      if (contenu !== null && !contenu.includes('\u0000')) fichiers.push({ chemin: e.path, contenu, majLe: maintenant });
    });
    fait += groupe.length;
    progression?.(fait, choisis.length);
  }

  if (!fichiers.length) throw new Error('Aucun fichier texte ou code trouvé dans ce dépôt.');
  fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin));
  return {
    nom: `${infos.name}${lu.branche ? ` (${branche})` : ''}`,
    description: `Importé de github.com/${proprio}/${depot} (${branche})${infos.description ? ` — ${infos.description}` : ''}`,
    branche,
    fichiers,
    ignores: arbre.tree.filter((e) => e.type === 'blob').length - fichiers.length,
  };
}
