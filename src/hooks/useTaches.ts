import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sauvegarder } from './usePersistant';
import { annulerRappel, programmerRappel } from '../rappels/notifications';

import type { Tache } from '../types';
import { reagir } from '../ui/Avatar';

const CLE_STOCKAGE = 'marceau:taches';

function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useTaches() {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [chargement, setChargement] = useState(true);
  const courantes = useRef<Tache[]>([]);
  courantes.current = taches;

  useEffect(() => {
    AsyncStorage.getItem(CLE_STOCKAGE)
      .then((brut) => {
        if (brut) setTaches(JSON.parse(brut));
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    if (chargement) return;
    sauvegarder(CLE_STOCKAGE, taches);
  }, [taches, chargement]);

  const ajouter = useCallback((texte: string) => {
    const propre = texte.trim();
    if (!propre) return;
    setTaches((prev) => [
      { id: nouvelId(), texte: propre, terminee: false, creeeLe: Date.now() },
      ...prev,
    ]);
  }, []);

  const ajouterPlusieurs = useCallback((textes: string[]) => {
    const maintenant = Date.now();
    const nouvelles = textes
      .map((t) => t.trim())
      .filter(Boolean)
      .map((texte, i) => ({ id: nouvelId(), texte, terminee: false, creeeLe: maintenant - i }));
    if (nouvelles.length) setTaches((prev) => [...nouvelles, ...prev]);
  }, []);

  const basculer = useCallback((id: string) => {
    const t = courantes.current.find((x) => x.id === id);
    // Une tâche terminée n'a plus besoin de son rappel.
    if (t && !t.terminee && t.rappel) annulerRappel(t.rappel.id);
    if (t && !t.terminee) reagir('rock', 'Tâche terminée !');
    setTaches((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, terminee: !t.terminee, rappel: t.terminee ? t.rappel : undefined } : t,
      ),
    );
  }, []);

  const supprimer = useCallback((id: string) => {
    annulerRappel(courantes.current.find((x) => x.id === id)?.rappel?.id);
    setTaches((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const viderTerminees = useCallback(() => {
    courantes.current.filter((t) => t.terminee).forEach((t) => annulerRappel(t.rappel?.id));
    setTaches((prev) => prev.filter((t) => !t.terminee));
  }, []);

  /** Programme (ou retire, avec null) le rappel d'une tâche. */
  const definirRappel = useCallback(async (id: string, date: Date | null) => {
    const t = courantes.current.find((x) => x.id === id);
    if (!t) return;
    await annulerRappel(t.rappel?.id);
    let rappel: Tache['rappel'];
    if (date) {
      const idNotif = await programmerRappel('⏰ Rappel Marceau', t.texte, date);
      if (!idNotif) {
        Alert.alert(
          'Notifications bloquées',
          'Autorise les notifications de Marceau dans les réglages du téléphone pour recevoir les rappels.',
        );
        return;
      }
      rappel = { date: date.getTime(), id: idNotif };
    }
    setTaches((prev) => prev.map((x) => (x.id === id ? { ...x, rappel } : x)));
  }, []);

  return { taches, chargement, ajouter, ajouterPlusieurs, basculer, supprimer, viderTerminees, definirRappel };
}
