import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import {
  connexionActive,
  ORDRE_FOURNISSEURS,
  reglagesParDefaut,
  type Connexion,
  type Espace,
  type IdFournisseur,
  type ReglagesIA,
} from './fournisseurs';

const CLE_REGLAGES = 'marceau:ia';
const cleSecrete = (id: IdFournisseur) => `marceau-ia-cle-${id}`;
const CLE_GITHUB = 'marceau-github-jeton';

type Contexte = {
  reglages: ReglagesIA;
  /** IA du Chat et des tâches. */
  connexion: Connexion;
  /** IA du Codex. */
  connexionCodex: Connexion;
  pret: boolean;
  enregistrer: (r: ReglagesIA) => Promise<void>;
  /** Ouvre l'écran des réglages (fourni par l'application). */
  ouvrirReglages: (espace?: Espace) => void;
};

const ReglagesCtx = createContext<Contexte | null>(null);

/** Réglages de l'IA partagés par toute l'appli. Les clés API vont dans le coffre sécurisé. */
export function ReglagesIAProvider({
  children,
  ouvrirReglages,
}: {
  children: ReactNode;
  ouvrirReglages: (espace?: Espace) => void;
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
          actifCodex: ORDRE_FOURNISSEURS.includes(lu.actifCodex) ? lu.actifCodex : defaut.actifCodex,
          configs: { ...defaut.configs },
          jetonGithub: (await SecureStore.getItemAsync(CLE_GITHUB).catch(() => null)) ?? '',
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
      actifCodex: r.actifCodex,
      configs: Object.fromEntries(
        ORDRE_FOURNISSEURS.map((id) => [id, { url: r.configs[id].url, modele: r.configs[id].modele }]),
      ),
    };
    await AsyncStorage.setItem(CLE_REGLAGES, JSON.stringify(sansCles)).catch(() => {});
    if (r.jetonGithub.trim()) await SecureStore.setItemAsync(CLE_GITHUB, r.jetonGithub.trim()).catch(() => {});
    else await SecureStore.deleteItemAsync(CLE_GITHUB).catch(() => {});
    for (const id of ORDRE_FOURNISSEURS) {
      const cle = r.configs[id].cle.trim();
      if (cle) await SecureStore.setItemAsync(cleSecrete(id), cle).catch(() => {});
      else await SecureStore.deleteItemAsync(cleSecrete(id)).catch(() => {});
    }
  }, []);

  const valeur = useMemo(
    () => ({
      reglages,
      connexion: connexionActive(reglages, 'chat'),
      connexionCodex: connexionActive(reglages, 'codex'),
      pret,
      enregistrer,
      ouvrirReglages,
    }),
    [reglages, pret, enregistrer, ouvrirReglages],
  );

  return <ReglagesCtx.Provider value={valeur}>{children}</ReglagesCtx.Provider>;
}

/** Connexion de l'espace demandé. */
export function useConnexion(espace: Espace = 'chat'): Connexion {
  const { connexion, connexionCodex } = useReglagesIA();
  return espace === 'codex' ? connexionCodex : connexion;
}

export function useReglagesIA(): Contexte {
  const ctx = useContext(ReglagesCtx);
  if (!ctx) throw new Error('useReglagesIA doit être utilisé dans ReglagesIAProvider');
  return ctx;
}
