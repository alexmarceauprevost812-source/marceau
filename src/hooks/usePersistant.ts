import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let alerteAffichee = false;

/**
 * Enregistre une valeur sur le téléphone. En cas d'échec (stockage plein, etc.), prévient
 * l'utilisateur au lieu de laisser croire que c'est enregistré : une seule alerte tant que
 * les enregistrements échouent, puis de nouveau après un enregistrement réussi.
 */
export async function sauvegarder(cle: string, valeur: unknown) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(valeur));
    alerteAffichee = false;
  } catch {
    if (alerteAffichee) return;
    alerteAffichee = true;
    Alert.alert(
      'Enregistrement impossible',
      "Tes dernières modifications n'ont pas pu être enregistrées sur le téléphone (espace de stockage plein ?). " +
        'Elles seront perdues à la fermeture de l’application. Libère de la place ou supprime d’anciennes discussions ou projets.',
    );
  }
}

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
    sauvegarder(cle, valeur);
  }, [cle, valeur]);

  const modifier = useCallback((f: T | ((prev: T) => T)) => setValeur(f), []);
  return [valeur, modifier, chargement] as const;
}

export function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
