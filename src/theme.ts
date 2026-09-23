import { useColorScheme } from 'react-native';

const clair = {
  fond: '#F6F7FB',
  carte: '#FFFFFF',
  texte: '#1B1D28',
  texteDoux: '#6B7080',
  bordure: '#E3E5EE',
  accent: '#4F5BD5',
  surAccent: '#FFFFFF',
  danger: '#D64545',
};

const sombre: typeof clair = {
  fond: '#111218',
  carte: '#1C1E27',
  texte: '#F1F2F6',
  texteDoux: '#9A9FB0',
  bordure: '#2C2F3B',
  accent: '#8C95FF',
  surAccent: '#111218',
  danger: '#FF7A7A',
};

export type Couleurs = typeof clair;

export function useCouleurs(): Couleurs {
  return useColorScheme() === 'dark' ? sombre : clair;
}
