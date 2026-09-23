import type { MessageIA } from './ia/client';

export type Tache = {
  id: string;
  texte: string;
  terminee: boolean;
  creeeLe: number;
  /** Rappel programmé : date (ms) et identifiant de la notification. */
  rappel?: { date: number; id: string };
};

export type Filtre = 'toutes' | 'actives' | 'terminees';

/** Façon de travailler de l'IA dans une discussion. */
export type Mode = 'libre' | 'ecriture' | 'etude';

export type Conversation = {
  id: string;
  titre: string;
  mode: Mode;
  messages: MessageIA[];
  creeeLe: number;
  majLe: number;
};

export type Fichier = {
  chemin: string;
  contenu: string;
  majLe: number;
  /** Contenu lors de la dernière synchro GitHub (absent = nouveau fichier). */
  origine?: string;
};

/** Dépôt GitHub relié à un projet Codex. */
export type LienGithub = { proprio: string; depot: string; branche: string; commit: string };

export type Projet = {
  id: string;
  nom: string;
  description: string;
  fichiers: Fichier[];
  messages: MessageIA[];
  /** Dépôt GitHub relié (lecture et écriture). */
  github?: LienGithub;
  /** Fichiers supprimés depuis la dernière synchro GitHub. */
  supprimes?: string[];
  creeLe: number;
  majLe: number;
};
