import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sauvegarder } from './hooks/usePersistant';

/** Préférences de l'application (apparence, sécurité, voix), gardées sur le téléphone. */
export type Preferences = {
  theme: 'auto' | 'jour' | 'nuit';
  accent: 'orange' | 'bleu' | 'vert' | 'violet' | 'rose';
  verrou: boolean;
  vitesseVoix: number;
};

const CLE = 'marceau:preferences';
const DEFAUT: Preferences = { theme: 'auto', accent: 'orange', verrou: false, vitesseVoix: 1 };

let etat = { prefs: DEFAUT, pret: false };
const abonnes = new Set<() => void>();
const avertir = () => abonnes.forEach((f) => f());

AsyncStorage.getItem(CLE)
  .then((brut) => {
    if (brut) etat = { ...etat, prefs: { ...DEFAUT, ...JSON.parse(brut) } };
  })
  .catch(() => {})
  .finally(() => {
    etat = { ...etat, pret: true };
    avertir();
  });

export function modifierPreferences(changement: Partial<Preferences>) {
  etat = { ...etat, prefs: { ...etat.prefs, ...changement } };
  sauvegarder(CLE, etat.prefs);
  avertir();
}

const abonner = (f: () => void) => {
  abonnes.add(f);
  return () => abonnes.delete(f);
};

/** Préférences actuelles + `pret` (false tant qu'elles ne sont pas chargées). */
export function usePreferences() {
  return useSyncExternalStore(abonner, () => etat);
}
