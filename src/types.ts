export type Tache = {
  id: string;
  texte: string;
  terminee: boolean;
  creeeLe: number;
};

export type Filtre = 'toutes' | 'actives' | 'terminees';
