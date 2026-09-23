/**
 * Fournisseurs d'IA gratuits compatibles avec l'API OpenAI (/chat/completions).
 *
 * - OpenCode Zen : modèles gratuits hébergés par OpenCode (clé gratuite requise,
 *   à créer sur https://opencode.ai/auth). La liste des modèles gratuits change
 *   souvent : https://opencode.ai/docs/zen/
 * - Ollama : modèles open source (Llama, Qwen, Gemma, Mistral…) qui tournent sur
 *   ton propre ordinateur. Aucune clé, aucune donnée envoyée sur Internet.
 */

export type IdFournisseur = 'opencode' | 'ollama';

export type Fournisseur = {
  id: IdFournisseur;
  nom: string;
  description: string;
  urlParDefaut: string;
  modeleParDefaut: string;
  modelesSuggeres: string[];
  besoinCle: boolean;
};

export const FOURNISSEURS: Record<IdFournisseur, Fournisseur> = {
  opencode: {
    id: 'opencode',
    nom: 'OpenCode Zen',
    description:
      'Modèles gratuits en ligne. Crée une clé gratuite sur opencode.ai/auth. Les requêtes des modèles gratuits peuvent servir à améliorer ces modèles.',
    urlParDefaut: 'https://opencode.ai/zen/v1',
    modeleParDefaut: 'big-pickle',
    modelesSuggeres: ['big-pickle', 'nemotron-3.5-lightning-free', 'mimo-v2.6-flash-free'],
    besoinCle: true,
  },
  ollama: {
    id: 'ollama',
    nom: 'Ollama (local)',
    description:
      "Modèles open source sur ton ordinateur. Lance Ollama avec OLLAMA_HOST=0.0.0.0, puis mets l'adresse IP de ton ordi ci-dessous (même Wi-Fi que le téléphone).",
    urlParDefaut: 'http://192.168.1.10:11434/v1',
    modeleParDefaut: 'llama3.2',
    modelesSuggeres: ['llama3.2', 'qwen3', 'gemma3', 'mistral'],
    besoinCle: false,
  },
};

export type ReglagesIA = {
  fournisseur: IdFournisseur;
  url: string;
  modele: string;
  cle: string;
};

export function reglagesParDefaut(id: IdFournisseur = 'opencode'): ReglagesIA {
  const f = FOURNISSEURS[id];
  return { fournisseur: id, url: f.urlParDefaut, modele: f.modeleParDefaut, cle: '' };
}
