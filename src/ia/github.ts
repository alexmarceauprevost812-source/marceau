import type { Fichier, LienGithub, Projet } from '../types';

/**
 * GitHub : lire (importer) et écrire (commit + push) des projets du Codex.
 * Le jeton personnel GitHub se met dans Réglages IA → Codex.
 */

const API = 'https://api.github.com';
const MAX_FICHIERS = 300;
const MAX_TAILLE_FICHIER = 200_000; // octets
const MAX_TAILLE_TOTALE = 4_000_000;

const DOSSIERS_IGNORES =
  /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.expo|\.gradle|Pods|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode)\//;
const FICHIERS_IGNORES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.min\.(js|css)|\.map)$/i;
const EXTENSIONS_TEXTE =
  /\.(txt|md|markdown|json|jsonc|xml|html?|css|scss|less|js|jsx|mjs|cjs|ts|tsx|py|rb|php|java|kt|kts|swift|c|h|cpp|hpp|cs|go|rs|dart|lua|sh|bash|zsh|ps1|bat|sql|yml|yaml|toml|ini|cfg|conf|gradle|properties|vue|svelte|astro|tex|csv|env\.example|gitignore|editorconfig|prettierrc|eslintrc|svg)$|(^|\/)(Dockerfile|Makefile|LICENSE|README|Procfile|CLAUDE\.md|AGENTS\.md)$/i;

export type ResultatImport = {
  nom: string;
  description: string;
  lien: LienGithub;
  fichiers: Fichier[];
  ignores: number;
};

export type Depot = {
  nomComplet: string;
  prive: boolean;
  branche: string;
  description: string;
  majLe: string;
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

class ErreurGithub extends Error {
  constructor(
    message: string,
    public statut: number,
  ) {
    super(message);
  }
}

async function api<T>(chemin: string, jeton?: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(chemin.startsWith('http') ? chemin : `${API}${chemin}`, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(jeton?.trim() ? { Authorization: `Bearer ${jeton.trim()}` } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ErreurGithub('Impossible de joindre GitHub. Vérifie ta connexion Internet.', 0);
  }
  if (!reponse.ok) {
    const detail = await reponse.json().catch(() => ({}) as { message?: string });
    const msg = (detail as { message?: string }).message ?? '';
    let texte: string;
    switch (reponse.status) {
      case 401:
        texte = 'Jeton GitHub refusé ou expiré. Vérifie-le dans Réglages IA → Codex.';
        break;
      case 403:
      case 429:
        texte = /rate limit/i.test(msg)
          ? 'Limite de GitHub atteinte. Ajoute ton jeton GitHub dans les réglages (5000 demandes/heure au lieu de 60).'
          : `GitHub refuse l’accès : ton jeton n’a pas la permission nécessaire (Contents : lecture et écriture). ${msg}`;
        break;
      case 404:
        texte = 'Introuvable sur GitHub (adresse, branche, ou dépôt privé sans jeton).';
        break;
      case 409:
        texte = 'Le dépôt est vide ou en conflit.';
        break;
      case 422:
        texte = `GitHub a refusé la demande : ${msg}`;
        break;
      default:
        texte = `Erreur GitHub ${reponse.status}. ${msg}`.trim();
    }
    throw new ErreurGithub(texte, reponse.status);
  }
  if (reponse.status === 204) return undefined as T;
  return reponse.json() as Promise<T>;
}

/**
 * Trouve la branche et le commit d'une référence écrite après « /tree/ ». Une branche peut
 * contenir des « / » (feature/foo) et l'adresse peut continuer vers un dossier
 * (…/tree/main/src) : on essaie du plus long au plus court jusqu'à trouver ce qui existe.
 */
async function resoudreReference(
  proprio: string,
  depot: string,
  reference: string,
  jeton?: string,
): Promise<{ branche: string; commit: string }> {
  const morceaux = reference.split('/').filter(Boolean);
  for (let n = morceaux.length; n >= 1; n--) {
    const essai = morceaux.slice(0, n).join('/');
    try {
      const c = await api<{ sha: string }>(`/repos/${proprio}/${depot}/commits/${encodeURIComponent(essai)}`, jeton);
      return { branche: essai, commit: c.sha };
    } catch (e) {
      if (e instanceof ErreurGithub && (e.statut === 404 || e.statut === 422)) continue;
      throw e;
    }
  }
  throw new Error(`Branche introuvable : « ${reference} ».`);
}

const refBranche = (branche: string) => branche.split('/').map(encodeURIComponent).join('/');

/** Vérifie le jeton et renvoie le nom d'utilisateur GitHub. */
export async function utilisateurGithub(jeton: string): Promise<string> {
  const u = await api<{ login: string }>('/user', jeton);
  return u.login;
}

/** Liste les dépôts de l'utilisateur (les plus récents d'abord). */
export async function listerDepots(jeton: string): Promise<Depot[]> {
  const liste = await api<
    { full_name: string; private: boolean; default_branch: string; description: string | null; pushed_at: string }[]
  >('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member', jeton);
  return liste.map((d) => ({
    nomComplet: d.full_name,
    prive: d.private,
    branche: d.default_branch,
    description: d.description ?? '',
    majLe: d.pushed_at,
  }));
}

/** Liste les branches d'un dépôt. */
export async function listerBranches(proprio: string, depot: string, jeton?: string): Promise<string[]> {
  const liste = await api<{ name: string }[]>(`/repos/${proprio}/${depot}/branches?per_page=100`, jeton);
  return liste.map((b) => b.name);
}

async function teteDeBranche(proprio: string, depot: string, branche: string, jeton?: string): Promise<string> {
  const ref = await api<{ object: { sha: string } }>(`/repos/${proprio}/${depot}/git/ref/heads/${refBranche(branche)}`, jeton);
  return ref.object.sha;
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
    `/repos/${proprio}/${depot}`,
    jeton,
  );
  const { branche, commit } = lu.branche
    ? await resoudreReference(proprio, depot, lu.branche, jeton)
    : { branche: infos.default_branch, commit: await teteDeBranche(proprio, depot, infos.default_branch, jeton) };
  const arbre = await api<{ tree: { path: string; type: string; size?: number; sha: string }[]; truncated: boolean }>(
    `/repos/${proprio}/${depot}/git/trees/${commit}?recursive=1`,
    jeton,
  );

  const candidats = arbre.tree.filter(
    (e) =>
      e.type === 'blob' &&
      !DOSSIERS_IGNORES.test(e.path) &&
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
    `https://raw.githubusercontent.com/${proprio}/${depot}/${commit}/${chemin.split('/').map(encodeURIComponent).join('/')}`;

  // Téléchargement par petits groupes (le jeton sert aussi pour les dépôts privés)
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
      if (contenu !== null && !contenu.includes('\u0000')) {
        fichiers.push({ chemin: e.path, contenu, origine: contenu, majLe: maintenant });
      }
    });
    fait += groupe.length;
    progression?.(fait, choisis.length);
  }

  if (!fichiers.length) throw new Error('Aucun fichier texte ou code trouvé dans ce dépôt.');
  fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin));
  return {
    nom: `${infos.name}${lu.branche ? ` (${branche})` : ''}`,
    description: `github.com/${proprio}/${depot} (${branche})${infos.description ? ` — ${infos.description}` : ''}`,
    lien: { proprio, depot, branche, commit },
    fichiers,
    ignores: arbre.tree.filter((e) => e.type === 'blob').length - fichiers.length,
  };
}

// ---------------------------------------------------------------------------
// Changements locaux et envoi (commit + push)
// ---------------------------------------------------------------------------

export type Changement = { chemin: string; etat: 'ajoute' | 'modifie' | 'supprime'; contenu: string | null };

/** Ce qui a changé dans le projet depuis la dernière synchro GitHub. */
export function changementsDuProjet(p: Projet): Changement[] {
  const liste: Changement[] = [];
  for (const f of p.fichiers) {
    if (f.origine === undefined) liste.push({ chemin: f.chemin, etat: 'ajoute', contenu: f.contenu });
    else if (f.origine !== f.contenu) liste.push({ chemin: f.chemin, etat: 'modifie', contenu: f.contenu });
  }
  for (const chemin of p.supprimes ?? []) {
    if (!p.fichiers.some((f) => f.chemin === chemin)) liste.push({ chemin, etat: 'supprime', contenu: null });
  }
  return liste.sort((a, b) => a.chemin.localeCompare(b.chemin));
}

/**
 * Crée un commit avec les changements et le pousse sur la branche.
 * Si la branche n'existe pas, elle est créée à partir de `brancheDepart`.
 * Les autres fichiers du dépôt ne sont pas touchés.
 */
export async function envoyerSurGithub(o: {
  jeton: string;
  proprio: string;
  depot: string;
  branche: string;
  brancheDepart?: string;
  message: string;
  changements: Changement[];
}): Promise<{ commit: string; url: string; brancheCreee: boolean }> {
  const { jeton, proprio, depot, branche } = o;
  if (!jeton.trim()) throw new Error('Ajoute ton jeton GitHub dans Réglages IA → Codex pour envoyer tes changements.');
  if (!o.changements.length) throw new Error('Aucun changement à envoyer.');
  const base = `/repos/${proprio}/${depot}`;

  let parent: string;
  let brancheCreee = false;
  try {
    parent = await teteDeBranche(proprio, depot, branche, jeton);
  } catch (e) {
    if (!(e instanceof ErreurGithub && e.statut === 404) || !o.brancheDepart) throw e;
    const depart = await teteDeBranche(proprio, depot, o.brancheDepart, jeton);
    await api(`${base}/git/refs`, jeton, { method: 'POST', body: { ref: `refs/heads/${branche}`, sha: depart } });
    parent = depart;
    brancheCreee = true;
  }

  const commitParent = await api<{ tree: { sha: string } }>(`${base}/git/commits/${parent}`, jeton);
  const arbre = await api<{ sha: string }>(`${base}/git/trees`, jeton, {
    method: 'POST',
    body: {
      base_tree: commitParent.tree.sha,
      tree: o.changements.map((c) =>
        c.etat === 'supprime'
          ? { path: c.chemin, mode: '100644', type: 'blob', sha: null }
          : { path: c.chemin, mode: '100644', type: 'blob', content: c.contenu ?? '' },
      ),
    },
  });
  const commit = await api<{ sha: string; html_url: string }>(`${base}/git/commits`, jeton, {
    method: 'POST',
    body: { message: o.message.trim() || 'Mise à jour depuis Marceau Codex', tree: arbre.sha, parents: [parent] },
  });
  await api(`${base}/git/refs/heads/${refBranche(branche)}`, jeton, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false },
  });
  return { commit: commit.sha, url: commit.html_url, brancheCreee };
}

/** Crée un nouveau dépôt sur le compte de l'utilisateur. */
export async function creerDepot(jeton: string, nom: string, description: string, prive: boolean) {
  const d = await api<{ name: string; owner: { login: string }; default_branch: string }>('/user/repos', jeton, {
    method: 'POST',
    body: { name: nom, description, private: prive, auto_init: true },
  });
  return { proprio: d.owner.login, depot: d.name, branche: d.default_branch || 'main' };
}

/** Marque le projet comme synchronisé après un envoi réussi. */
export function projetSynchronise(p: Projet, lien: LienGithub): Projet {
  return {
    ...p,
    github: lien,
    supprimes: [],
    fichiers: p.fichiers.map((f) => ({ ...f, origine: f.contenu })),
  };
}
