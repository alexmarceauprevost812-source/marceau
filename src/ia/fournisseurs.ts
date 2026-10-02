/**
 * Fournisseurs d'IA.
 *
 * - OpenCode Zen : modèles gratuits en ligne (clé gratuite sur https://opencode.ai/auth).
 *   Liste des modèles gratuits : https://opencode.ai/docs/zen/
 * - Ollama : modèles open source sur ton ordinateur, sans clé.
 * - Anthropic : les modèles Claude, avec ta clé API (https://platform.claude.com).
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
  /** Pas à pas affiché sous le champ de la clé, pour qui n'a jamais créé de clé API. */
  etapesCle?: string[];
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
    etapesCle: [
      'Touche « Obtenir ma clé » : le site OpenCode s’ouvre.',
      'Connecte-toi (avec GitHub ou Google, par exemple).',
      'Crée une clé API, puis copie-la. C’est gratuit.',
      'Reviens ici, colle-la dans le champ, puis touche « Enregistrer ».',
    ],
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
    lienCle: 'https://platform.claude.com/settings/keys',
    etapesCle: [
      'Touche « Obtenir ma clé » : la console Claude d’Anthropic s’ouvre.',
      'Crée un compte (ou connecte-toi) avec ton adresse courriel.',
      'Ajoute un peu de crédit dans la facturation (Billing) : c’est payant à l’usage.',
      'Crée une clé (« Create Key »), donne-lui un nom, puis copie-la. Elle commence par « sk-ant- » et ne s’affiche qu’une seule fois.',
      'Reviens ici, colle-la dans le champ, puis touche « Enregistrer ».',
    ],
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
    etapesCle: [
      'Touche « Obtenir ma clé » : la plateforme OpenAI s’ouvre.',
      'Crée un compte (ou connecte-toi).',
      'Ajoute un peu de crédit dans la facturation (Billing) : c’est payant à l’usage.',
      'Crée une clé (« Create new secret key »), puis copie-la. Elle commence par « sk- » et ne s’affiche qu’une seule fois.',
      'Reviens ici, colle-la dans le champ, puis touche « Enregistrer ».',
    ],
  },
};

export const ORDRE_FOURNISSEURS: IdFournisseur[] = ['opencode', 'ollama', 'anthropic', 'openai'];

/** Réglages d'un fournisseur. */
export type ConfigFournisseur = { url: string; modele: string; cle: string };

/** Chaque espace peut utiliser une IA différente (ex. Codex avec Claude). */
export type Espace = 'chat' | 'codex';

/** Réglages complets de l'IA. */
export type ReglagesIA = {
  /** IA du Chat et de l'assistant des tâches. */
  actif: IdFournisseur;
  /** IA du Codex. */
  actifCodex: IdFournisseur;
  configs: Record<IdFournisseur, ConfigFournisseur>;
  /** Jeton personnel GitHub (lecture et écriture des dépôts dans le Codex). */
  jetonGithub: string;
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
    actifCodex: 'anthropic',
    jetonGithub: '',
    configs: {
      opencode: configParDefaut('opencode'),
      ollama: configParDefaut('ollama'),
      anthropic: configParDefaut('anthropic'),
      openai: configParDefaut('openai'),
    },
  };
}

export function connexionActive(r: ReglagesIA, espace: Espace = 'chat'): Connexion {
  const id = espace === 'codex' ? r.actifCodex : r.actif;
  return { fournisseur: id, ...r.configs[id] };
}

export function manqueCle(c: Connexion): boolean {
  return FOURNISSEURS[c.fournisseur].besoinCle && !c.cle.trim();
}
