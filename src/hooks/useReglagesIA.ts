import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { reglagesParDefaut, type ReglagesIA } from '../ia/fournisseurs';

const CLE_REGLAGES = 'marceau:ia';
const CLE_SECRETE = 'marceau-ia-cle';

/** Réglages de l'IA. La clé API est gardée dans le coffre sécurisé du téléphone. */
export function useReglagesIA() {
  const [reglages, setReglages] = useState<ReglagesIA>(reglagesParDefaut());
  const [pret, setPret] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const brut = await AsyncStorage.getItem(CLE_REGLAGES);
        const cle = (await SecureStore.getItemAsync(CLE_SECRETE).catch(() => null)) ?? '';
        const base = brut ? { ...reglagesParDefaut(), ...JSON.parse(brut) } : reglagesParDefaut();
        setReglages({ ...base, cle });
      } catch {
        // réglages par défaut
      } finally {
        setPret(true);
      }
    })();
  }, []);

  const enregistrer = useCallback(async (nouveaux: ReglagesIA) => {
    setReglages(nouveaux);
    const { cle, ...reste } = nouveaux;
    await AsyncStorage.setItem(CLE_REGLAGES, JSON.stringify(reste)).catch(() => {});
    if (cle) await SecureStore.setItemAsync(CLE_SECRETE, cle).catch(() => {});
    else await SecureStore.deleteItemAsync(CLE_SECRETE).catch(() => {});
  }, []);

  return { reglages, pret, enregistrer };
}
