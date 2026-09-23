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
};

export type Couleurs = typeof clair;

export function useCouleurs(): Couleurs {
  return useColorScheme() === 'dark' ? sombre : clair;
}
