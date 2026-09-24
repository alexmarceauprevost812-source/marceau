import { fetch as fetchExpo } from 'expo/fetch';

import { base, entetes, erreurLisible, erreurReseau, versAPI, type MessageIA } from './client';
import type { Connexion } from './fournisseurs';

/**
 * Mode agent du Codex : Claude travaille lui-même dans le projet avec des outils
 * (lister, lire, écrire, modifier, supprimer des fichiers), en plusieurs étapes,
 * jusqu'à ce que la demande soit faite. Réservé à l'API Anthropic (outils de l'API Messages).
 *
 * L'agent travaille sur une copie des fichiers : l'écran applique le résultat à la fin
 * et garde l'ancienne version pour pouvoir tout annuler.
 */

/** Fichiers du projet : chemin → contenu. */
export type FichiersAgent = Record<string, string>;

export type EtapeAgent = {
  type: 'lire' | 'ecrire' | 'modifier' | 'supprimer' | 'lister' | 'erreur' | 'texte';
  detail: string;
};

export type ResultatAgent = {
  /** Résumé final écrit par Claude. */
  texte: string;
  /** Fichiers après le travail de l'agent. */
  fichiers: FichiersAgent;
  /** Chemins créés, modifiés ou supprimés. */
  crees: string[];
  modifies: string[];
  supprimes: string[];
  /** Arrêt avant la fin (limite d'étapes, refus, réponse coupée…). */
  avertissement?: string;
};

/** Ce que Claude est en train d'écrire, en direct (texte de réponse ou code d'un fichier). */
export type DirectAgent =
  | { type: 'texte'; texte: string }
  | { type: 'ecrire' | 'modifier'; chemin: string; code: string };

type OptionsAgent = {
  systeme: string;
  /** Conversation précédente avec l'agent (texte) + la nouvelle demande en dernier. */
  messages: MessageIA[];
  fichiers: FichiersAgent;
  signal?: AbortSignal;
  onEtape?: (e: EtapeAgent) => void;
  /** Appelé à chaque morceau reçu pendant que Claude écrit ; null quand le bloc en cours est fini. */
  onDirect?: (d: DirectAgent | null) => void;
  /** Nombre maximum d'allers-retours avec Claude pour une demande. */
  maxEtapes?: number;
};

const OUTILS = [
  {
    name: 'lister_fichiers',
    description: 'Liste tous les fichiers du projet avec leur nombre de lignes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'lire_fichier',
    description: "Renvoie le contenu complet d'un fichier du projet. Lis un fichier avant de le modifier.",
    input_schema: {
      type: 'object',
      properties: { chemin: { type: 'string', description: 'Chemin exact du fichier, ex. src/main.py' } },
      required: ['chemin'],
      additionalProperties: false,
    },
  },
  {
    name: 'ecrire_fichier',
    description:
      "Crée un fichier ou remplace entièrement son contenu. Utilise-le pour un nouveau fichier ou une réécriture complète ; pour un petit changement dans un gros fichier, préfère modifier_fichier.",
    input_schema: {
      type: 'object',
      properties: {
        chemin: { type: 'string', description: 'Chemin du fichier, ex. index.html ou src/app.js' },
        contenu: { type: 'string', description: 'Contenu complet du fichier' },
      },
      required: ['chemin', 'contenu'],
      additionalProperties: false,
    },
    // Le code arrive au fur et à mesure qu'il est écrit (sinon tout d'un coup à la fin du fichier).
    eager_input_streaming: true,
  },
  {
    name: 'modifier_fichier',
    description:
      "Remplace un passage exact d'un fichier par un nouveau texte. Le passage « ancien » doit apparaître exactement une fois dans le fichier (copie-le tel quel, espaces compris ; ajoute des lignes voisines s'il n'est pas unique).",
    input_schema: {
      type: 'object',
      properties: {
        chemin: { type: 'string' },
        ancien: { type: 'string', description: 'Texte exact à remplacer' },
        nouveau: { type: 'string', description: 'Texte de remplacement' },
      },
      required: ['chemin', 'ancien', 'nouveau'],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: 'supprimer_fichier',
    description: 'Supprime un fichier du projet.',
    input_schema: {
      type: 'object',
      properties: { chemin: { type: 'string' } },
      required: ['chemin'],
      additionalProperties: false,
    },
  },
];

type BlocContenu = { type: string; [cle: string]: unknown };
type ReponseMessages = { content: BlocContenu[]; stop_reason: string | null };

const chaine = (v: unknown) => (typeof v === 'string' ? v : '');
const nettoyerChemin = (c: string) => c.trim().replace(/^\.?\/+/, '');

/** Exécute un outil sur la copie des fichiers. Renvoie le texte du résultat (ou lève une erreur). */
function executerOutil(nom: string, entree: Record<string, unknown>, f: FichiersAgent, onEtape?: (e: EtapeAgent) => void): string {
  const chemin = nettoyerChemin(chaine(entree.chemin));
  switch (nom) {
    case 'lister_fichiers': {
      onEtape?.({ type: 'lister', detail: 'Liste des fichiers' });
      const liste = Object.keys(f)
        .sort()
        .map((c) => `${c} (${f[c].split('\n').length} lignes)`);
      return liste.length ? liste.join('\n') : 'Le projet est vide.';
    }
    case 'lire_fichier': {
      if (!(chemin in f)) throw new Error(`Fichier introuvable : ${chemin}. Utilise lister_fichiers.`);
      onEtape?.({ type: 'lire', detail: chemin });
      return f[chemin] || '(fichier vide)';
    }
    case 'ecrire_fichier': {
      if (!chemin) throw new Error('Chemin manquant.');
      if (typeof entree.contenu !== 'string') throw new Error('Contenu manquant.');
      const existait = chemin in f;
      f[chemin] = entree.contenu;
      onEtape?.({ type: 'ecrire', detail: chemin });
      return `${existait ? 'Fichier remplacé' : 'Fichier créé'} : ${chemin} (${entree.contenu.split('\n').length} lignes).`;
    }
    case 'modifier_fichier': {
      if (!(chemin in f)) throw new Error(`Fichier introuvable : ${chemin}.`);
      const ancien = chaine(entree.ancien);
      if (!ancien) throw new Error('Le passage « ancien » est vide.');
      const nb = f[chemin].split(ancien).length - 1;
      if (nb === 0) throw new Error(`Passage introuvable dans ${chemin}. Relis le fichier et copie le passage exactement.`);
      if (nb > 1) throw new Error(`Le passage apparaît ${nb} fois dans ${chemin} : ajoute des lignes voisines pour qu'il soit unique.`);
      f[chemin] = f[chemin].replace(ancien, () => chaine(entree.nouveau));
      onEtape?.({ type: 'modifier', detail: chemin });
      return `Fichier modifié : ${chemin}.`;
    }
    case 'supprimer_fichier': {
      if (!(chemin in f)) throw new Error(`Fichier introuvable : ${chemin}.`);
      delete f[chemin];
      onEtape?.({ type: 'supprimer', detail: chemin });
      return `Fichier supprimé : ${chemin}.`;
    }
    default:
      throw new Error(`Outil inconnu : ${nom}`);
  }
}

/** Lit une chaîne JSON à partir de s[i] (juste après le guillemet ouvrant), même si elle n'est pas finie. */
function lireChaine(s: string, i: number): { texte: string; fin: number; complete: boolean } {
  let texte = '';
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') return { texte, fin: i + 1, complete: true };
    if (ch !== '\\') {
      texte += ch;
      i++;
      continue;
    }
    const e = s[i + 1];
    if (e === undefined) break; // échappement coupé : on attend la suite
    if (e === 'u') {
      const hex = s.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      texte += String.fromCharCode(parseInt(hex, 16) || 0);
      i += 6;
      continue;
    }
    texte += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' } as Record<string, string>)[e] ?? e;
    i += 2;
  }
  return { texte, fin: i, complete: false };
}

/** Champs texte d'un objet JSON encore en cours d'écriture ({"chemin":"a.js","contenu":"deb…). */
export function champsPartiels(json: string): Record<string, string> {
  const champs: Record<string, string> = {};
  const blanc = /\s/;
  let i = json.indexOf('{');
  if (i < 0) return champs;
  i++;
  for (;;) {
    while (i < json.length && (blanc.test(json[i]) || json[i] === ',')) i++;
    if (json[i] !== '"') return champs;
    const cle = lireChaine(json, i + 1);
    if (!cle.complete) return champs;
    i = cle.fin;
    while (i < json.length && blanc.test(json[i])) i++;
    if (json[i] !== ':') return champs;
    i++;
    while (i < json.length && blanc.test(json[i])) i++;
    if (json[i] !== '"') return champs; // seules les valeurs texte nous intéressent
    const valeur = lireChaine(json, i + 1);
    champs[cle.texte] = valeur.texte;
    if (!valeur.complete) return champs;
    i = valeur.fin;
  }
}

/** Réponse de Claude + les appels d'outils dont l'entrée JSON reçue est invalide (id → texte brut). */
type ReponseDirecte = ReponseMessages & { invalides: Map<string, string> };

/** Appelle Claude en direct (flux SSE) et reconstruit la réponse complète, bloc par bloc. */
async function appeler(
  c: Connexion,
  corps: Record<string, unknown>,
  signal?: AbortSignal,
  onDirect?: (d: DirectAgent | null) => void,
): Promise<ReponseDirecte> {
  let reponse: Awaited<ReturnType<typeof fetchExpo>>;
  try {
    reponse = await fetchExpo(`${base(c)}/messages`, {
      method: 'POST',
      headers: entetes(c),
      body: JSON.stringify({ ...corps, stream: true }),
      signal,
    });
  } catch (e) {
    throw erreurReseau(e, c);
  }
  if (!reponse.ok) throw await erreurLisible(reponse, c);
  if (!reponse.body) throw new Error('Le serveur n’a pas renvoyé de réponse en direct.');

  const blocs: BlocContenu[] = [];
  const jsons = new Map<number, string>();
  const invalides = new Map<string, string>();
  let stop: string | null = null;
  let fini = false;

  const direct = (index: number) => {
    const b = blocs[index];
    if (!onDirect || !b) return;
    if (b.type === 'text') onDirect({ type: 'texte', texte: chaine(b.text) });
    else if (b.type === 'tool_use' && (b.name === 'ecrire_fichier' || b.name === 'modifier_fichier')) {
      const champs = champsPartiels(jsons.get(index) ?? '');
      const code = b.name === 'ecrire_fichier' ? champs.contenu : champs.nouveau;
      if (code !== undefined) {
        onDirect({ type: b.name === 'ecrire_fichier' ? 'ecrire' : 'modifier', chemin: nettoyerChemin(champs.chemin ?? ''), code });
      }
    }
  };

  const traiter = (ligne: string) => {
    const l = ligne.trim();
    if (!l.startsWith('data:')) return;
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(l.slice(5).trim());
    } catch {
      return;
    }
    switch (ev.type) {
      case 'error':
        throw new Error(ev.error?.message ?? 'Erreur du serveur Anthropic.');
      case 'content_block_start':
        blocs[ev.index] = { ...ev.content_block };
        if (ev.content_block?.type === 'tool_use') jsons.set(ev.index, '');
        break;
      case 'content_block_delta': {
        const b = blocs[ev.index];
        const d = ev.delta ?? {};
        if (!b) break;
        if (d.type === 'text_delta') b.text = chaine(b.text) + chaine(d.text);
        else if (d.type === 'thinking_delta') b.thinking = chaine(b.thinking) + chaine(d.thinking);
        else if (d.type === 'signature_delta') b.signature = chaine(d.signature);
        else if (d.type === 'input_json_delta') jsons.set(ev.index, (jsons.get(ev.index) ?? '') + chaine(d.partial_json));
        direct(ev.index);
        break;
      }
      case 'content_block_stop': {
        const b = blocs[ev.index];
        if (b?.type === 'tool_use') {
          const brut = jsons.get(ev.index) ?? '';
          try {
            b.input = brut.trim() ? JSON.parse(brut) : {};
          } catch {
            b.input = {};
            invalides.set(chaine(b.id), brut);
          }
        }
        onDirect?.(null);
        break;
      }
      case 'message_delta':
        if (ev.delta?.stop_reason) stop = ev.delta.stop_reason;
        break;
      case 'message_stop':
        fini = true;
        break;
    }
  };

  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let tampon = '';
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      tampon += decodeur.decode(value, { stream: true });
      const lignes = tampon.split('\n');
      tampon = lignes.pop() ?? '';
      lignes.forEach(traiter);
    }
    traiter(tampon);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError' || signal?.aborted) throw e;
    throw e instanceof Error && e.message ? e : erreurReseau(e, c);
  } finally {
    onDirect?.(null);
  }
  if (!fini) throw new Error('La connexion a été coupée pendant que Claude écrivait. Réessaie.');
  return { content: blocs.filter(Boolean), stop_reason: stop, invalides };
}

/** Fait travailler Claude dans le projet jusqu'à ce que la demande soit faite. */
export async function lancerAgent(c: Connexion, o: OptionsAgent): Promise<ResultatAgent> {
  const avant = o.fichiers;
  const f: FichiersAgent = { ...o.fichiers };
  const messages: unknown[] = await versAPI(o.messages, 'anthropic');
  const maxEtapes = o.maxEtapes ?? 30;
  const textes: string[] = [];
  let avertissement: string | undefined;

  for (let etape = 0; ; etape++) {
    if (etape >= maxEtapes) {
      avertissement = `Arrêt après ${maxEtapes} étapes. Demande « continue » pour que Claude reprenne.`;
      break;
    }
    const r = await appeler(
      c,
      {
        model: c.modele.trim(),
        max_tokens: 32000,
        system: o.systeme,
        tools: OUTILS,
        messages,
        // Mise en cache automatique : le projet et l'historique ne sont pas refacturés à chaque étape.
        cache_control: { type: 'ephemeral' },
      },
      o.signal,
      o.onDirect,
    );
    // On renvoie la réponse telle quelle (y compris les blocs de réflexion) à l'étape suivante.
    messages.push({ role: 'assistant', content: r.content });

    for (const b of r.content) {
      if (b.type === 'text' && chaine(b.text).trim()) {
        textes.push(chaine(b.text).trim());
        o.onEtape?.({ type: 'texte', detail: chaine(b.text).trim() });
      }
    }

    if (r.stop_reason === 'refusal') {
      avertissement = 'Claude a refusé de continuer cette demande.';
      break;
    }
    const appels = r.content.filter((b) => b.type === 'tool_use');
    if (!appels.length) {
      if (r.stop_reason === 'max_tokens') avertissement = 'La réponse de Claude a été coupée (trop longue).';
      break;
    }

    // Tous les résultats d'outils dans un seul message, un par appel (même en cas d'erreur).
    const coupe = r.stop_reason === 'max_tokens';
    const resultats = appels.map((b) => {
      const id = chaine(b.id);
      if (coupe) {
        return {
          type: 'tool_result',
          tool_use_id: id,
          is_error: true,
          content: 'Ta réponse a été coupée avant la fin : cet appel est incomplet. Écris des fichiers plus petits ou utilise modifier_fichier.',
        };
      }
      const brut = r.invalides.get(id);
      if (brut !== undefined) {
        o.onEtape?.({ type: 'erreur', detail: 'Entrée d’outil illisible, Claude va réessayer.' });
        return { type: 'tool_result', tool_use_id: id, is_error: true, content: JSON.stringify({ INVALID_JSON: brut }) };
      }
      try {
        const entree = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>;
        return { type: 'tool_result', tool_use_id: id, content: executerOutil(chaine(b.name), entree, f, o.onEtape) };
      } catch (e) {
        o.onEtape?.({ type: 'erreur', detail: (e as Error).message });
        return { type: 'tool_result', tool_use_id: id, is_error: true, content: (e as Error).message };
      }
    });
    messages.push({ role: 'user', content: resultats });
  }

  const crees = Object.keys(f).filter((k) => !(k in avant));
  const modifies = Object.keys(f).filter((k) => k in avant && f[k] !== avant[k]);
  const supprimes = Object.keys(avant).filter((k) => !(k in f));
  return {
    texte: textes.length ? textes[textes.length - 1] : 'Terminé.',
    fichiers: f,
    crees,
    modifies,
    supprimes,
    avertissement,
  };
}
