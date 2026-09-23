import type { Section } from '../navigation/Menu';

/**
 * Les applications affichées sur le Bureau.
 * Pour ajouter une application : ajoute une ligne ici (et l'écran qu'elle ouvre).
 * Elle apparaîtra toute seule sur le Bureau au prochain APK.
 */
export type AppBureau = {
  id: string;
  nom: string;
  icone: string;
  couleur: string;
  ouvre: Section | 'mise-a-jour';
};

export const APPLICATIONS: AppBureau[] = [
  { id: 'chat', nom: 'Chat', icone: '💬', couleur: '#FF8A1F', ouvre: 'chat' },
  { id: 'codex', nom: 'Codex', icone: '💻', couleur: '#2F6FEB', ouvre: 'codex' },
  { id: 'projet', nom: 'Projet', icone: '📁', couleur: '#1F9D55', ouvre: 'projet' },
  { id: 'terminal', nom: 'Terminal', icone: '⌨️', couleur: '#1B1B1B', ouvre: 'terminal' },
  { id: 'parametres', nom: 'Paramètres', icone: '⚙️', couleur: '#5B6068', ouvre: 'parametres' },
  { id: 'agenda', nom: 'Agenda', icone: '📅', couleur: '#0B8F3A', ouvre: 'agenda' },
  { id: 'preferences', nom: 'Préférences', icone: '🎨', couleur: '#E0357A', ouvre: 'preferences' },
  { id: 'mise-a-jour', nom: 'Mise à jour', icone: '⬇️', couleur: '#8B3FE0', ouvre: 'mise-a-jour' },
];
