import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sauvegarder } from '../hooks/usePersistant';

import { effacerSecret, ecrireSecret, lireSecret } from './coffre';

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

/** Réglages de l'IA partagés par toute l'appli. Les clés API restent sur l'appareil (voir coffre.ts). */
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
          jetonGithub: (await lireSecret(CLE_GITHUB)) ?? '',
        };
        for (const id of ORDRE_FOURNISSEURS) {
          const cle = (await lireSecret(cleSecrete(id))) ?? '';
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
    await sauvegarder(CLE_REGLAGES, sansCles);
    if (r.jetonGithub.trim()) await ecrireSecret(CLE_GITHUB, r.jetonGithub.trim());
    else await effacerSecret(CLE_GITHUB);
    for (const id of ORDRE_FOURNISSEURS) {
      const cle = r.configs[id].cle.trim();
      if (cle) await ecrireSecret(cleSecrete(id), cle);
      else await effacerSecret(cleSecrete(id));
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
