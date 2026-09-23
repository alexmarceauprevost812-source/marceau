/**
 * Fournisseurs d'IA.
 *
 * - OpenCode Zen : modèles gratuits en ligne (clé gratuite sur https://opencode.ai/auth).
 *   Liste des modèles gratuits : https://opencode.ai/docs/zen/
 * - Ollama : modèles open source sur ton ordinateur, sans clé.
 * - Anthropic : les modèles Claude, avec ta clé API (https://console.anthropic.com).
 * - OpenAI : GPT et Codex, avec ta clé API (https://platform.openai.com).
 *
 * Le bouton « Charger les modèles » des réglages lit la liste à jour auprès du serveur,
 * les modèles ci-dessous ne sont que des suggestions de départ.
 */

export type IdFournisseur = 'opencode' | 'ollama' | 'anthropic' | 'openai';

/** Format de l'API : OpenAI (/chat/completions) ou Anthropic (/messages). */
export type FormatAPI = 'openai' | 'anthropic';

export type Fournisseur = {
  id: IdFournisseur;
  nom: string;
  gratuit: boolean;
  format: FormatAPI;
  description: string;
  urlParDefaut: string;
  modeleParDefaut: string;
  modelesSuggeres: string[];
  besoinCle: boolean;
  lienCle?: string;
};

export const FOURNISSEURS: Record<IdFournisseur, Fournisseur> = {
  opencode: {
    id: 'opencode',
    nom: 'OpenCode Zen',
    gratuit: true,
    format: 'openai',
    description:
      'Modèles gratuits en ligne. Crée une clé gratuite sur opencode.ai/auth. Les requêtes des modèles gratuits peuvent servir à améliorer ces modèles.',
    urlParDefaut: 'https://opencode.ai/zen/v1',
    modeleParDefaut: 'big-pickle',
    modelesSuggeres: ['big-pickle', 'nemotron-3.5-lightning-free', 'mimo-v2.6-flash-free'],
    besoinCle: true,
    lienCle: 'https://opencode.ai/auth',
  },
  ollama: {
    id: 'ollama',
    nom: 'Ollama (local)',
    gratuit: true,
    format: 'openai',
    description:
      "Modèles open source sur ton ordinateur. Lance Ollama avec OLLAMA_HOST=0.0.0.0, puis mets l'adresse IP de ton ordi ci-dessous (même Wi-Fi que le téléphone).",
    urlParDefaut: 'http://192.168.1.10:11434/v1',
    modeleParDefaut: 'llama3.2',
    modelesSuggeres: ['llama3.2', 'qwen3', 'qwen2.5-coder', 'gemma3'],
    besoinCle: false,
  },
  anthropic: {
    id: 'anthropic',
    nom: 'Claude (Anthropic)',
    gratuit: false,
    format: 'anthropic',
    description:
      'Les modèles Claude avec ta propre clé API Anthropic. Payant à l’usage, facturé sur ton compte Anthropic.',
    urlParDefaut: 'https://api.anthropic.com/v1',
    modeleParDefaut: 'claude-sonnet-5',
    modelesSuggeres: ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001'],
    besoinCle: true,
    lienCle: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    nom: 'OpenAI (Codex)',
    gratuit: false,
    format: 'openai',
    description:
      'GPT et Codex avec ta propre clé API OpenAI. Payant à l’usage, facturé sur ton compte OpenAI.',
    urlParDefaut: 'https://api.openai.com/v1',
    modeleParDefaut: 'gpt-5.3-codex',
    modelesSuggeres: ['gpt-5.3-codex', 'gpt-5.5', 'gpt-5-mini'],
    besoinCle: true,
    lienCle: 'https://platform.openai.com/api-keys',
  },
};

export const ORDRE_FOURNISSEURS: IdFournisseur[] = ['opencode', 'ollama', 'anthropic', 'openai'];

/** Réglages d'un fournisseur. */
export type ConfigFournisseur = { url: string; modele: string; cle: string };

/** Réglages complets de l'IA. */
export type ReglagesIA = {
  actif: IdFournisseur;
  configs: Record<IdFournisseur, ConfigFournisseur>;
};

/** Ce qu'il faut pour faire un appel : le fournisseur et sa config. */
export type Connexion = ConfigFournisseur & { fournisseur: IdFournisseur };

export function configParDefaut(id: IdFournisseur): ConfigFournisseur {
  const f = FOURNISSEURS[id];
  return { url: f.urlParDefaut, modele: f.modeleParDefaut, cle: '' };
}

export function reglagesParDefaut(): ReglagesIA {
  return {
    actif: 'opencode',
    configs: {
      opencode: configParDefaut('opencode'),
      ollama: configParDefaut('ollama'),
      anthropic: configParDefaut('anthropic'),
      openai: configParDefaut('openai'),
    },
  };
}

export function connexionActive(r: ReglagesIA): Connexion {
  return { fournisseur: r.actif, ...r.configs[r.actif] };
}

export function manqueCle(c: Connexion): boolean {
  return FOURNISSEURS[c.fournisseur].besoinCle && !c.cle.trim();
}
