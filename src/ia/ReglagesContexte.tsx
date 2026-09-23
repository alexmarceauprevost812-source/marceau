import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { sauvegarder } from '../hooks/usePersistant';

import {
  connexionActive,
  ORDRE_FOURNISSEURS,
  reglagesParDefaut,
  type Connexion,
  type IdFournisseur,
  type ReglagesIA,
} from './fournisseurs';

const CLE_REGLAGES = 'marceau:ia';
const cleSecrete = (id: IdFournisseur) => `marceau-ia-cle-${id}`;

type Contexte = {
  reglages: ReglagesIA;
  connexion: Connexion;
  pret: boolean;
  enregistrer: (r: ReglagesIA) => Promise<void>;
  /** Ouvre l'écran des réglages (fourni par l'application). */
  ouvrirReglages: () => void;
};

const ReglagesCtx = createContext<Contexte | null>(null);

/** Réglages de l'IA partagés par toute l'appli. Les clés API vont dans le coffre sécurisé. */
export function ReglagesIAProvider({
  children,
  ouvrirReglages,
}: {
  children: ReactNode;
  ouvrirReglages: () => void;
}) {
  const [reglages, setReglages] = useState<ReglagesIA>(reglagesParDefaut());
  const [pret, setPret] = useState(false);

  useEffect(() => {
    (async () => {
      const defaut = reglagesParDefaut();
      try {
        const brut = await AsyncStorage.getItem(CLE_REGLAGES);
        const lu = brut ? JSON.parse(brut) : {};
        const r: ReglagesIA = {
          actif: ORDRE_FOURNISSEURS.includes(lu.actif) ? lu.actif : defaut.actif,
          configs: { ...defaut.configs },
        };
        for (const id of ORDRE_FOURNISSEURS) {
          const cle = (await SecureStore.getItemAsync(cleSecrete(id)).catch(() => null)) ?? '';
          r.configs[id] = { ...defaut.configs[id], ...(lu.configs?.[id] ?? {}), cle };
        }
        setReglages(r);
      } catch {
        // réglages par défaut
      } finally {
        setPret(true);
      }
    })();
  }, []);

  const enregistrer = useCallback(async (r: ReglagesIA) => {
    setReglages(r);
    const sansCles = {
      actif: r.actif,
      configs: Object.fromEntries(
        ORDRE_FOURNISSEURS.map((id) => [id, { url: r.configs[id].url, modele: r.configs[id].modele }]),
      ),
    };
    await sauvegarder(CLE_REGLAGES, sansCles);
    for (const id of ORDRE_FOURNISSEURS) {
      const cle = r.configs[id].cle.trim();
      if (cle) await SecureStore.setItemAsync(cleSecrete(id), cle).catch(() => {});
      else await SecureStore.deleteItemAsync(cleSecrete(id)).catch(() => {});
    }
  }, []);

  const valeur = useMemo(
    () => ({ reglages, connexion: connexionActive(reglages), pret, enregistrer, ouvrirReglages }),
    [reglages, pret, enregistrer, ouvrirReglages],
  );

  return <ReglagesCtx.Provider value={valeur}>{children}</ReglagesCtx.Provider>;
}

export function useReglagesIA(): Contexte {
  const ctx = useContext(ReglagesCtx);
  if (!ctx) throw new Error('useReglagesIA doit être utilisé dans ReglagesIAProvider');
  return ctx;
}
