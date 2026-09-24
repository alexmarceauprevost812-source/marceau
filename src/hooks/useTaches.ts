import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sauvegarder } from './usePersistant';
import { annulerRappel, programmerRappel } from '../rappels/notifications';

import type { Tache } from '../types';
import { reagir } from '../ui/Avatar';

function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Tâches d'un projet. `cle` sépare les tâches par projet (le projet par défaut garde l'ancienne clé). */
export function useTaches(cle: string = 'marceau:taches') {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [chargement, setChargement] = useState(true);
  const courantes = useRef<Tache[]>([]);
  courantes.current = taches;

  // Recharge quand on change de projet (clé différente).
  useEffect(() => {
    let vivant = true;
    setChargement(true);
    setTaches([]);
    AsyncStorage.getItem(cle)
      .then((brut) => {
        if (vivant && brut) setTaches(JSON.parse(brut));
      })
      .catch(() => {})
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, [cle]);

  useEffect(() => {
    if (chargement) return;
    sauvegarder(cle, taches);
  }, [cle, taches, chargement]);

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
