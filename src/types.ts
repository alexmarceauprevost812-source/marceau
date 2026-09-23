import type { MessageIA } from './ia/client';

export type Tache = {
  id: string;
  texte: string;
  terminee: boolean;
  creeeLe: number;
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

export type Fichier = { chemin: string; contenu: string; majLe: number };

export type Projet = {
  id: string;
  nom: string;
  description: string;
  fichiers: Fichier[];
  messages: MessageIA[];
  creeLe: number;
  majLe: number;
};
