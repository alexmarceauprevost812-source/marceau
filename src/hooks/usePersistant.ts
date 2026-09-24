import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

let alerteAffichee = false;

/**
 * Prévient l'utilisateur qu'un enregistrement a échoué, au lieu de laisser croire que
 * c'est enregistré : une seule alerte tant que les enregistrements échouent, puis de
 * nouveau après un enregistrement réussi.
 */
function signalerEchec() {
  if (alerteAffichee) return;
  alerteAffichee = true;
  Alert.alert(
    'Enregistrement impossible',
    "Tes dernières modifications n'ont pas pu être enregistrées sur le téléphone (espace de stockage plein ?). " +
      'Elles seront perdues à la fermeture de l’application. Libère de la place ou supprime d’anciennes discussions ou projets.',
  );
}

/** Enregistre une petite valeur (tâches, réglages) dans AsyncStorage, en signalant les échecs. */
export async function sauvegarder(cle: string, valeur: unknown) {
  try {
    await AsyncStorage.setItem(cle, JSON.stringify(valeur));
    alerteAffichee = false;
  } catch {
    signalerEchec();
  }
}

/**
 * Stockage : un fichier JSON dans le dossier de l'appli (pas de limite de taille,
 * utile pour les gros projets Codex). Sur le web, on utilise AsyncStorage.
 */
function fichier(cle: string) {
  return new File(Paths.document, `${cle.replace(/[^\w-]/g, '_')}.json`);
}

async function lire(cle: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(cle);
  const f = fichier(cle);
  if (f.exists) return f.text();
  // Ancienne version : les données étaient dans AsyncStorage
  return AsyncStorage.getItem(cle);
}

async function ecrire(cle: string, valeur: string) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(cle, valeur);
  // On écrit d'abord un fichier temporaire, puis on le renomme : si l'écriture échoue
  // (stockage plein, appli fermée…), l'ancien fichier reste intact.
  const tmp = new File(Paths.document, `${cle.replace(/[^\w-]/g, '_')}.json.tmp`);
  tmp.create({ overwrite: true });
  tmp.write(valeur);
  tmp.moveSync(fichier(cle), { overwrite: true });
}

/** Lit une valeur enregistrée (hors composant), ou null si absente. */
export async function lirePersistant<T>(cle: string): Promise<T | null> {
  try {
    const brut = await lire(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}

/** Efface une valeur enregistrée (fichier + ancien AsyncStorage). */
export async function effacerPersistant(cle: string): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      const f = fichier(cle);
      if (f.exists) f.delete();
    }
  } catch {
    // rien de plus à faire
  }
  await AsyncStorage.removeItem(cle).catch(() => {});
}

/** État sauvegardé sur le téléphone, rechargé au démarrage. */
export function usePersistant<T>(cle: string, defaut: T) {
  const [valeur, setValeur] = useState<T>(defaut);
  const [chargement, setChargement] = useState(true);
  const charge = useRef(false);

  useEffect(() => {
    lire(cle)
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
    // On attend un peu pour regrouper les changements rapprochés
    const minuterie = setTimeout(() => {
      ecrire(cle, JSON.stringify(valeur))
        .then(() => {
          alerteAffichee = false;
        })
        .catch(signalerEchec);
    }, 300);
    return () => clearTimeout(minuterie);
  }, [cle, valeur]);

  const modifier = useCallback((f: T | ((prev: T) => T)) => setValeur(f), []);
  return [valeur, modifier, chargement] as const;
}

export function nouvelId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
