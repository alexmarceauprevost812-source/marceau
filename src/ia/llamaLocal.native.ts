import { initLlama, type LlamaContext } from 'llama.rn';

import { trouverModele } from './gguf';
import type { MessageLocal, OptionsLocal } from './llamaLocal';

/**
 * IA sur le téléphone : llama.cpp (via llama.rn) charge un fichier .gguf et répond sans internet.
 *
 * - Un seul modèle est gardé en mémoire à la fois ; on le recharge quand le réglage change.
 * - Une seule réponse à la fois (le Chat et le Codex se partagent le modèle) : les demandes font la file.
 * - Le processeur seul fait le travail (n_gpu_layers = 0) : c'est le réglage le plus stable sur tous
 *   les téléphones. Les gros modèles vont lentement : préfère un petit modèle (1B à 3B, quantifié Q4).
 */

export type { MessageLocal, OptionsLocal };

/** Taille de la mémoire de conversation. Plus grand = plus de contexte mais plus de mémoire utilisée. */
const TAILLE_CONTEXTE = 4096;
/** Longueur maximale d'une réponse (le reste du contexte sert à lire la conversation). */
const REPONSE_MAX = 2048;

/** Marques de fin de réponse des principales familles de modèles. */
const MOTS_ARRET = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
];

let contexte: LlamaContext | null = null;
let modeleCharge = '';
let file: Promise<unknown> = Promise.resolve();

async function charger(nom: string): Promise<LlamaContext> {
  if (contexte && modeleCharge === nom) return contexte;
  const modele = trouverModele(nom);
  if (!modele) {
    throw new Error(`Le modèle « ${nom} » est introuvable sur le téléphone. Choisis-en un dans les réglages de l'IA.`);
  }
  await libererModele();
  try {
    contexte = await initLlama({
      model: modele.uri,
      n_ctx: TAILLE_CONTEXTE,
      n_gpu_layers: 0,
      use_mlock: false,
    });
    modeleCharge = nom;
    return contexte;
  } catch (e) {
    contexte = null;
    modeleCharge = '';
    throw new Error(
      `Impossible de charger « ${nom} » (${(e as Error).message}). Le fichier est peut-être abîmé, ou le téléphone manque de mémoire : essaie un modèle plus petit.`,
    );
  }
}

/** Libère la mémoire du modèle (changement de modèle, fermeture). */
export async function libererModele(): Promise<void> {
  const ancien = contexte;
  contexte = null;
  modeleCharge = '';
  if (ancien) await ancien.release().catch(() => {});
}

async function repondre(nomModele: string, o: OptionsLocal): Promise<string> {
  if (o.signal?.aborted) return '';
  const ctx = await charger(nomModele);
  let texte = '';
  const arreter = () => {
    ctx.stopCompletion().catch(() => {});
  };
  o.signal?.addEventListener('abort', arreter);
  try {
    const resultat = await ctx.completion(
      {
        messages: o.messages,
        n_predict: Math.min(o.maxTokens ?? REPONSE_MAX, REPONSE_MAX),
        stop: MOTS_ARRET,
        // Le raisonnement (<think>…</think>) reste dans le texte : Marceau le cache avec sansReflexion().
        reasoning_format: 'none',
      },
      (donnees) => {
        texte += donnees.token;
        o.onMorceau?.(texte);
      },
    );
    // Le texte final de llama.cpp fait foi (il est nettoyé des marques de fin).
    if (resultat.text && !o.signal?.aborted) {
      texte = resultat.text;
      o.onMorceau?.(texte);
    }
    return texte;
  } finally {
    o.signal?.removeEventListener('abort', arreter);
  }
}

/** Fait répondre le modèle .gguf `nomModele` (nom du fichier). Les demandes se suivent une par une. */
export function discuterLocal(nomModele: string, o: OptionsLocal): Promise<string> {
  const suite = file.then(
    () => repondre(nomModele, o),
    () => repondre(nomModele, o),
  );
  file = suite.catch(() => {});
  return suite;
}
