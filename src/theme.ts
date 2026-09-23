import { useColorScheme } from 'react-native';

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
    ajout: '#1C6B1C',
    retrait: '#A31E16',
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
    ajout: '#7DF9C4',
    retrait: '#FF5A4E',
  },
};

export type Couleurs = typeof clair;

export function useCouleurs(): Couleurs {
  return useColorScheme() === 'dark' ? sombre : clair;
}
