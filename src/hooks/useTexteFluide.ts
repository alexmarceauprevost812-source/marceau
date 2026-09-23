import { useEffect, useRef, useState } from 'react';

const INTERVALLE_MS = 33; // ~30 images par seconde
const VITESSE_NORMALE = 110; // caractères par seconde, comme une lecture confortable

/**
 * Fait apparaître un texte (reçu par morceaux) de façon fluide, à vitesse normale.
 * Si l'IA envoie beaucoup d'un coup (ex. un gros bloc de code), l'affichage accélère
 * doucement pour ne jamais prendre trop de retard.
 */
export function useTexteFluide(cible: string, actif: boolean) {
  const [longueur, setLongueur] = useState(0);
  const cibleRef = useRef(cible);
  cibleRef.current = cible;

  useEffect(() => {
    if (!actif) {
      setLongueur(0);
      return;
    }
    const minuterie = setInterval(() => {
      setLongueur((n) => {
        const total = cibleRef.current.length;
        if (n >= total) return n;
        const retard = total - n;
        const base = (VITESSE_NORMALE * INTERVALLE_MS) / 1000; // ~3,6 caractères par image
        const pas = Math.max(base, retard / 25);
        return Math.min(total, Math.ceil(n + pas));
      });
    }, INTERVALLE_MS);
    return () => clearInterval(minuterie);
  }, [actif]);

  const affiche = cible.slice(0, longueur);
  return { affiche, aJour: longueur >= cible.length };
}
