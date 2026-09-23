import { fetch as fetchExpo } from 'expo/fetch';

import { FOURNISSEURS, type Connexion } from './fournisseurs';

export type Role = 'user' | 'assistant';
export type MessageIA = { role: Role; content: string };

type OptionsDiscussion = {
  systeme?: string;
  messages: MessageIA[];
  /** Reçoit le texte au fur et à mesure (affichage en direct). */
  onMorceau?: (texteComplet: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
};

const VERSION_ANTHROPIC = '2023-06-01';

function base(c: Connexion) {
  return c.url.trim().replace(/\/+$/, '');
}

function entetes(c: Connexion): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const cle = c.cle.trim();
  if (FOURNISSEURS[c.fournisseur].format === 'anthropic') {
    h['anthropic-version'] = VERSION_ANTHROPIC;
    h['anthropic-dangerous-direct-browser-access'] = 'true'; // requis seulement sur le web
    if (cle) h['x-api-key'] = cle;
  } else if (cle) {
    h.Authorization = `Bearer ${cle}`;
  }
  return h;
}

async function erreurLisible(reponse: { status: number; text(): Promise<string> }, c: Connexion) {
  const detail = await reponse.text().catch(() => '');
  let message = '';
  try {
    const j = JSON.parse(detail);
    message = j?.error?.message ?? j?.message ?? '';
  } catch {
    message = detail.slice(0, 160);
  }
  switch (reponse.status) {
    case 401:
    case 403:
      return new Error('Clé API refusée. Vérifie ta clé dans les réglages.');
    case 404:
      return new Error(`Modèle ou adresse introuvable (« ${c.modele} »). ${message}`.trim());
    case 429:
      return new Error('Limite atteinte pour le moment (quota gratuit ou crédits). Réessaie plus tard.');
    default:
      return new Error(`Erreur ${reponse.status} du serveur d'IA. ${message}`.trim());
  }
}

function erreurReseau(e: unknown, c: Connexion) {
  if ((e as Error)?.name === 'AbortError') return e as Error;
  return new Error(
    "Impossible de joindre le serveur d'IA. Vérifie l'adresse et ta connexion" +
      (c.fournisseur === 'ollama' ? ' (même Wi-Fi que ton ordinateur ?).' : '.'),
  );
}

/** La réponse a commencé puis la connexion a été coupée : `texte` contient le début reçu. */
export class ReponseInterrompue extends Error {
  constructor(public texte: string) {
    super('La connexion a été coupée pendant la réponse : elle est incomplète. Réessaie.');
    this.name = 'ReponseInterrompue';
  }
}

/** Envoie une conversation à l'IA et renvoie la réponse complète (en direct si onMorceau est fourni). */
export async function discuter(c: Connexion, o: OptionsDiscussion): Promise<string> {
  const format = FOURNISSEURS[c.fournisseur].format;
  const enDirect = !!o.onMorceau;
  const messages = o.messages.filter((m) => m.content.trim());

  let url: string;
  let corps: Record<string, unknown>;
  if (format === 'anthropic') {
    url = `${base(c)}/messages`;
    corps = {
      model: c.modele.trim(),
      // Les modèles Claude récents réfléchissent avant de répondre, et cette réflexion compte
      // dans max_tokens : une limite trop basse peut couper la réponse avant tout texte.
      max_tokens: o.maxTokens ?? 16000,
      messages,
      stream: enDirect,
      ...(o.systeme ? { system: o.systeme } : {}),
    };
  } else {
    url = `${base(c)}/chat/completions`;
    corps = {
      model: c.modele.trim(),
      messages: o.systeme ? [{ role: 'system', content: o.systeme }, ...messages] : messages,
      stream: enDirect,
    };
  }

  let reponse: Awaited<ReturnType<typeof fetchExpo>>;
  try {
    reponse = await fetchExpo(url, {
      method: 'POST',
      headers: entetes(c),
      body: JSON.stringify(corps),
      signal: o.signal,
    });
  } catch (e) {
    throw erreurReseau(e, c);
  }
  if (!reponse.ok) throw await erreurLisible(reponse, c);

  // Réponse d'un coup
  if (!enDirect || !reponse.body) {
    const brut = await reponse.text();
    const texte = texteDeReponse(brut, format);
    o.onMorceau?.(texte);
    return texte;
  }

  // Réponse en direct (Server-Sent Events)
  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  let texte = '';
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      const lignes = tampon.split('\n');
      tampon = lignes.pop() ?? '';
      for (const ligne of lignes) {
        const morceau = morceauSSE(ligne, format);
        if (morceau) {
          texte += morceau;
          o.onMorceau?.(texte);
        }
      }
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return texte;
    if (!texte) throw e instanceof Error && e.message ? e : erreurReseau(e, c);
    // Connexion coupée en cours de route : on ne fait pas passer le début pour une réponse complète.
    throw new ReponseInterrompue(texte);
  }
  const reste = morceauSSE(tampon, format);
  if (reste) {
    texte += reste;
    o.onMorceau?.(texte);
  }
  return texte;
}

function morceauSSE(ligne: string, format: 'openai' | 'anthropic'): string {
  const l = ligne.trim();
  if (!l.startsWith('data:')) return '';
  const donnees = l.slice(5).trim();
  if (!donnees || donnees === '[DONE]') return '';
  try {
    const j = JSON.parse(donnees);
    if (format === 'anthropic') {
      if (j.type === 'error') throw new Error(j.error?.message ?? 'Erreur du serveur Anthropic.');
      return j.type === 'content_block_delta' && j.delta?.type === 'text_delta' ? j.delta.text ?? '' : '';
    }
    return j.choices?.[0]?.delta?.content ?? '';
  } catch (e) {
    if (e instanceof SyntaxError) return '';
    throw e;
  }
}

function texteDeReponse(brut: string, format: 'openai' | 'anthropic'): string {
  try {
    const j = JSON.parse(brut);
    if (format === 'anthropic') {
      return (j.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
    }
    return j.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}

/** Liste les modèles proposés par le serveur. */
export async function listerModeles(c: Connexion): Promise<string[]> {
  let reponse: Awaited<ReturnType<typeof fetchExpo>>;
  try {
    reponse = await fetchExpo(`${base(c)}/models?limit=100`, { headers: entetes(c) });
  } catch (e) {
    throw erreurReseau(e, c);
  }
  if (!reponse.ok) throw await erreurLisible(reponse, c);
  const j = await reponse.json();
  const liste: { id?: string; name?: string }[] = j?.data ?? j?.models ?? [];
  return liste
    .map((m) => m.id ?? m.name ?? '')
    .filter(Boolean)
    .sort();
}

/** Retire le raisonnement interne que certains modèles open source affichent. */
export function sansReflexion(texte: string): string {
  return texte.replace(/<think>[\s\S]*?(<\/think>|$)/gi, '').trimStart();
}

// ---------------------------------------------------------------------------
// Assistant des tâches
// ---------------------------------------------------------------------------

const CONSIGNE_TACHES =
  "Tu es l'assistant de Marceau, une application de gestion de tâches en français. " +
  "L'utilisateur décrit un objectif. Découpe-le en 3 à 8 tâches concrètes, courtes " +
  '(moins de 60 caractères), commençant par un verbe, dans un ordre logique. ' +
  'Réponds UNIQUEMENT avec un tableau JSON de chaînes, sans aucun autre texte. ' +
  'Exemple : ["Choisir une date", "Réserver la salle"]';

/** Demande à l'IA de découper un objectif en tâches. */
export async function proposerTaches(c: Connexion, objectif: string): Promise<string[]> {
  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), 60_000);
  let texte: string;
  try {
    texte = await discuter(c, {
      systeme: CONSIGNE_TACHES,
      messages: [{ role: 'user', content: objectif.trim() }],
      signal: controleur.signal,
      maxTokens: 4096,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error("L'IA a mis trop de temps à répondre. Réessaie ou choisis un modèle plus léger.");
    }
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
  const taches = extraireTaches(texte);
  if (taches.length === 0) throw new Error("L'IA n'a proposé aucune tâche. Reformule ton objectif.");
  return taches;
}

/** Tolère les réponses imparfaites : bloc de code, texte autour, ou simple liste à puces. */
export function extraireTaches(texte: string): string[] {
  const propre = sansReflexion(texte);
  const debut = propre.indexOf('[');
  const fin = propre.lastIndexOf(']');
  if (debut !== -1 && fin > debut) {
    try {
      // Tolère une virgule finale (« ["A", "B",] »), fréquente chez les petits modèles.
      const tableau = JSON.parse(propre.slice(debut, fin + 1).replace(/,\s*\]$/, ']'));
      if (Array.isArray(tableau)) return nettoyer(tableau.map(String));
    } catch {
      // on essaie la liste ligne par ligne
    }
  }
  return nettoyer(
    propre
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))
      .filter((l) => l.trim() && !l.includes('```') && !l.trim().endsWith(':')),
  );
}

function nettoyer(liste: string[]): string[] {
  return liste
    .map((t) => t.trim().replace(/^["'«\s]+|["'»\s,]+$/g, ''))
    .filter(Boolean)
    .slice(0, 12);
}
