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

type OptionsAgent = {
  systeme: string;
  /** Conversation précédente avec l'agent (texte) + la nouvelle demande en dernier. */
  messages: MessageIA[];
  fichiers: FichiersAgent;
  signal?: AbortSignal;
  onEtape?: (e: EtapeAgent) => void;
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

async function appeler(c: Connexion, corps: Record<string, unknown>, signal?: AbortSignal): Promise<ReponseMessages> {
  let reponse: Awaited<ReturnType<typeof fetchExpo>>;
  try {
    reponse = await fetchExpo(`${base(c)}/messages`, {
      method: 'POST',
      headers: entetes(c),
      body: JSON.stringify(corps),
      signal,
    });
  } catch (e) {
    throw erreurReseau(e, c);
  }
  if (!reponse.ok) throw await erreurLisible(reponse, c);
  return (await reponse.json()) as ReponseMessages;
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
