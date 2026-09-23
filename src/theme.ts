import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { usePreferences, type Preferences } from './preferences';

/** Jour : gris mat, écriture noire, boutons orange. */
const clair = {
  fond: '#C4C5C7',
  carte: '#D3D4D6',
  texte: '#0D0D0D',
  texteDoux: '#3A3C40',
  bordure: '#A6A8AC',
  accent: '#F57C00',
  /** Orange plus foncé pour le texte et les contours (lisible sur le gris). */
  accentTexte: '#8F4200',
  surAccent: '#0D0D0D',
  danger: '#A31E16',
  /** Couleurs du code (coloration syntaxique). */
  code: {
    texte: '#0D0D0D',
    mot: '#A34700',
    chaine: '#1C6B1C',
    commentaire: '#5E6166',
    nombre: '#0B5CAD',
    balise: '#A3144D',
    attribut: '#6B2FB3',
    fonction: '#00605F',
  },
};

/** Nuit : noir, écriture blanche, boutons orange. */
const sombre: typeof clair = {
  fond: '#000000',
  carte: '#0E0E0E',
  texte: '#FFFFFF',
  texteDoux: '#A8A8A8',
  bordure: '#262626',
  accent: '#FF8A1F',
  accentTexte: '#FF8A1F',
  surAccent: '#000000',
  danger: '#FF5A4E',
  code: {
    texte: '#FFFFFF',
    mot: '#FF8A1F',
    chaine: '#FFD166',
    commentaire: '#6F7F5C',
    nombre: '#5CD6FF',
    balise: '#FF6B9A',
    attribut: '#C49BFF',
    fonction: '#7DF9C4',
  },
};

export type Couleurs = typeof clair;

/** Couleurs des boutons au choix (jour / nuit). */
export const ACCENTS: Record<
  Preferences['accent'],
  { nom: string; jour: [string, string, string]; nuit: [string, string, string] }
> = {
  // [bouton, texte coloré, écriture sur le bouton]
  orange: { nom: 'Orange', jour: ['#F57C00', '#8F4200', '#0D0D0D'], nuit: ['#FF8A1F', '#FF8A1F', '#000000'] },
  bleu: { nom: 'Bleu', jour: ['#2F6FEB', '#1A3F8F', '#0D0D0D'], nuit: ['#4D8BFF', '#6FA0FF', '#000000'] },
  vert: { nom: 'Vert', jour: ['#1F9D55', '#0F5C30', '#0D0D0D'], nuit: ['#34D17A', '#34D17A', '#000000'] },
  violet: { nom: 'Violet', jour: ['#8B3FE0', '#56209A', '#FFFFFF'], nuit: ['#A970FF', '#B98AFF', '#000000'] },
  rose: { nom: 'Rose', jour: ['#E0357A', '#8F1A4A', '#0D0D0D'], nuit: ['#FF5C9D', '#FF7AAF', '#000000'] },
};

/** true si l'application est en mode nuit (selon le téléphone ou le choix fait dans Préférences). */
export function useModeNuit(): boolean {
  const systeme = useColorScheme();
  const { prefs } = usePreferences();
  return prefs.theme === 'auto' ? systeme === 'dark' : prefs.theme === 'nuit';
}

export function useCouleurs(): Couleurs {
  const nuit = useModeNuit();
  const { prefs } = usePreferences();
  return useMemo(() => {
    const base = nuit ? sombre : clair;
    const [accent, accentTexte, surAccent] = ACCENTS[prefs.accent][nuit ? 'nuit' : 'jour'];
    return { ...base, accent, accentTexte, surAccent };
  }, [nuit, prefs.accent]);
}
