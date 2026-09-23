import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Tache } from '../types';

const CLE_STOCKAGE = 'marceau:taches';

function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useTaches() {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [chargement, setChargement] = useState(true);

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
    AsyncStorage.setItem(CLE_STOCKAGE, JSON.stringify(taches)).catch(() => {});
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
    setTaches((prev) =>
      prev.map((t) => (t.id === id ? { ...t, terminee: !t.terminee } : t)),
    );
  }, []);

  const supprimer = useCallback((id: string) => {
    setTaches((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const viderTerminees = useCallback(() => {
    setTaches((prev) => prev.filter((t) => !t.terminee));
  }, []);

  return { taches, chargement, ajouter, ajouterPlusieurs, basculer, supprimer, viderTerminees };
}
