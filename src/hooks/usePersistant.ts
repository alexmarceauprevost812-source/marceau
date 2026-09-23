import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** État sauvegardé sur le téléphone (AsyncStorage), rechargé au démarrage. */
export function usePersistant<T>(cle: string, defaut: T) {
  const [valeur, setValeur] = useState<T>(defaut);
  const [chargement, setChargement] = useState(true);
  const charge = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(cle)
      .then((brut) => {
        if (brut) setValeur(JSON.parse(brut));
      })
      .catch(() => {})
      .finally(() => {
        charge.current = true;
        setChargement(false);
      });
  }, [cle]);

  useEffect(() => {
    if (!charge.current) return;
    AsyncStorage.setItem(cle, JSON.stringify(valeur)).catch(() => {});
  }, [cle, valeur]);

  const modifier = useCallback((f: T | ((prev: T) => T)) => setValeur(f), []);
  return [valeur, modifier, chargement] as const;
}

export function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
