import catalogue from '../../bureau/modeles-locaux.json';
/** Catalogue commun Android et ordinateur, avec révisions immuables. */
export const MODELES_LOCAUX = catalogue;
export type ModeleLocal = (typeof MODELES_LOCAUX)[number];
export function modeleLocal(id: string): ModeleLocal {
  const modele = MODELES_LOCAUX.find(m => m.id === id);
  if (!modele) throw new Error('Ce modèle local n’est pas proposé. Choisis un modèle dans les réglages.');
  return modele;
}
