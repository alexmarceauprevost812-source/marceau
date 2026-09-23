import type { ReglagesIA } from './fournisseurs';

const CONSIGNE =
  "Tu es l'assistant de Marceau, une application de gestion de tâches en français. " +
  "L'utilisateur décrit un objectif. Découpe-le en 3 à 8 tâches concrètes, courtes " +
  '(moins de 60 caractères), commençant par un verbe, dans un ordre logique. ' +
  'Réponds UNIQUEMENT avec un tableau JSON de chaînes, sans aucun autre texte. ' +
  'Exemple : ["Choisir une date", "Réserver la salle"]';

const DELAI_MS = 60_000;

/** Demande à l'IA de découper un objectif en tâches. */
export async function proposerTaches(reglages: ReglagesIA, objectif: string): Promise<string[]> {
  const url = reglages.url.trim().replace(/\/+$/, '') + '/chat/completions';
  const entetes: Record<string, string> = { 'Content-Type': 'application/json' };
  if (reglages.cle.trim()) entetes.Authorization = `Bearer ${reglages.cle.trim()}`;

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), DELAI_MS);

  let reponse: Response;
  try {
    reponse = await fetch(url, {
      method: 'POST',
      headers: entetes,
      signal: controleur.signal,
      body: JSON.stringify({
        model: reglages.modele.trim(),
        temperature: 0.4,
        messages: [
          { role: 'system', content: CONSIGNE },
          { role: 'user', content: objectif.trim() },
        ],
      }),
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') {
      throw new Error("L'IA a mis trop de temps à répondre. Réessaie ou choisis un modèle plus léger.");
    }
    throw new Error(
      "Impossible de joindre le serveur d'IA. Vérifie l'adresse et ta connexion" +
        (reglages.fournisseur === 'ollama' ? ' (même Wi-Fi que ton ordinateur ?).' : '.'),
    );
  } finally {
    clearTimeout(minuterie);
  }

  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '');
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error('Clé API refusée. Vérifie ta clé dans les réglages.');
    }
    if (reponse.status === 404) {
      throw new Error(`Modèle ou adresse introuvable (« ${reglages.modele} »).`);
    }
    if (reponse.status === 429) {
      throw new Error('Limite gratuite atteinte pour le moment. Réessaie plus tard.');
    }
    throw new Error(`Erreur ${reponse.status} du serveur d'IA. ${detail.slice(0, 160)}`.trim());
  }

  const donnees = await reponse.json();
  const texte: string = donnees?.choices?.[0]?.message?.content ?? '';
  const taches = extraireTaches(texte);
  if (taches.length === 0) throw new Error("L'IA n'a proposé aucune tâche. Reformule ton objectif.");
  return taches;
}

/** Tolère les réponses imparfaites : bloc de code, texte autour, ou simple liste à puces. */
export function extraireTaches(texte: string): string[] {
  const sansReflexion = texte.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const debut = sansReflexion.indexOf('[');
  const fin = sansReflexion.lastIndexOf(']');
  if (debut !== -1 && fin > debut) {
    try {
      // Tolère une virgule finale (« ["A", "B",] »), fréquente chez les petits modèles.
      const tableau = JSON.parse(sansReflexion.slice(debut, fin + 1).replace(/,\s*\]$/, ']'));
      if (Array.isArray(tableau)) return nettoyer(tableau.map(String));
    } catch {
      // on essaie la liste ligne par ligne
    }
  }
  return nettoyer(
    sansReflexion
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
