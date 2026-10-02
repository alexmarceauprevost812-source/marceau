import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';

/** Dépôt GitHub où le workflow publie un nouvel APK à chaque déploiement. */
export const DEPOT = 'alexmarceauprevost812-source/marceau';
const ID_APPLICATION = 'org.marceau.app';

export type InfoMaj = { numero: number; nom: string; notes: string; urlApk: string };
export type EtatMaj =
  | { etat: 'inconnu' }
  | { etat: 'verification' }
  | { etat: 'a-jour' }
  | { etat: 'disponible'; info: InfoMaj }
  | { etat: 'erreur'; message: string };

/** Numéro de build installé (versionCode Android, mis par le workflow). */
export function numeroInstalle(): number {
  const n = parseInt(Application.nativeBuildVersion ?? '', 10);
  return Number.isFinite(n) ? n : 0;
}

/** true dans le vrai APK Marceau (pas dans Expo Go ni sur iOS), et dans la version web. */
const web = Platform.OS === 'web';
const verifiable = () => web || (Platform.OS === 'android' && Application.applicationId === ID_APPLICATION);

/**
 * Version web : chaque déploiement Vercel change le nom du script principal (il contient une
 * empreinte du code). On relit la page d'accueil sur le serveur et on compare ce nom avec celui
 * du script chargé dans cette page : s'il diffère, une nouvelle version est en ligne.
 */
const MOTIF_SCRIPT = /\/_expo\/static\/js\/web\/[^"']+\.js/;

function scriptCharge(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLScriptElement>('script[src*="/_expo/static/js/web/"]');
  return el ? new URL(el.src).pathname : null;
}

async function chercherVersionWeb(): Promise<InfoMaj | null> {
  const actuel = scriptCharge();
  if (!actuel) return null; // serveur de développement : rien à comparer
  const r = await fetch(`/?maj=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Le site a répondu ${r.status}`);
  const enLigne = MOTIF_SCRIPT.exec(await r.text())?.[0];
  if (!enLigne || enLigne === actuel) return null;
  return { numero: 0, nom: 'web', notes: '', urlApk: '' };
}

type VersionGithub = { tag_name?: string; name?: string; body?: string; assets?: { name?: string; browser_download_url: string }[] };

/**
 * Cherche la version build-N la plus haute. On ne se fie pas à la « dernière version » de
 * GitHub : quand deux constructions se terminent presque en même temps, la plus ancienne
 * peut être publiée en dernier et devenir « la dernière ».
 */
async function chercherDerniereVersion(): Promise<InfoMaj | null> {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (r.status === 404) return null; // aucune version publiée pour l'instant
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}`);
  const versions: VersionGithub[] = await r.json();
  let meilleure: InfoMaj | null = null;
  for (const v of versions) {
    const m = /^build-(\d+)$/.exec(v.tag_name ?? '');
    const apk = (v.assets ?? []).find((a) => a.name?.endsWith('.apk'));
    if (!m || !apk) continue;
    const numero = parseInt(m[1], 10);
    if (!meilleure || numero > meilleure.numero) {
      meilleure = { numero, nom: v.name || v.tag_name || '', notes: (v.body ?? '').trim(), urlApk: apk.browser_download_url };
    }
  }
  return meilleure;
}

type Contexte = { maj: EtatMaj; verifier: (silencieux?: boolean) => Promise<void>; installer: () => void };
const MajCtx = createContext<Contexte | null>(null);

export function useMiseAJour(): Contexte {
  const c = useContext(MajCtx);
  if (!c) throw new Error('useMiseAJour doit être dans <MiseAJourProvider>');
  return c;
}

/** Vérifie au démarrage s'il y a un nouvel APK sur GitHub et propose de l'installer. */
export function MiseAJourProvider({ children }: { children: ReactNode }) {
  const [maj, setMaj] = useState<EtatMaj>({ etat: 'inconnu' });
  const infoRef = useRef<InfoMaj | null>(null);

  const installer = useCallback(() => {
    // Web : la nouvelle version est déjà en ligne, il suffit de recharger la page.
    if (web) {
      window.location.reload();
      return;
    }
    const info = infoRef.current;
    // Android télécharge l'APK puis demande de confirmer l'installation (obligatoire hors Play Store).
    if (info) Linking.openURL(info.urlApk).catch(() => {});
  }, []);

  const proposer = useCallback(
    (info: InfoMaj) => {
      // Alert.alert ne fait rien sur le web : on utilise la boîte de confirmation du navigateur.
      if (web) {
        if (window.confirm('Une nouvelle version de Marceau est en ligne. Mettre à jour maintenant ?')) installer();
        return;
      }
      Alert.alert(
        'Nouvelle version de Marceau',
        `La version ${info.nom} est prête.${info.notes ? `\n\n${info.notes.slice(0, 300)}` : ''}`,
        [
          { text: 'Plus tard', style: 'cancel' },
          { text: 'Installer', onPress: installer },
        ],
      );
    },
    [installer],
  );

  const verifier = useCallback(
    async (silencieux = false) => {
      if (!verifiable()) {
        setMaj({ etat: 'erreur', message: 'La mise à jour automatique fonctionne dans l’APK Android.' });
        return;
      }
      setMaj({ etat: 'verification' });
      try {
        const info = web ? await chercherVersionWeb() : await chercherDerniereVersion();
        if (info && (web || info.numero > numeroInstalle())) {
          infoRef.current = info;
          setMaj({ etat: 'disponible', info });
          if (!silencieux) proposer(info);
        } else {
          infoRef.current = null;
          setMaj({ etat: 'a-jour' });
        }
      } catch (e) {
        setMaj({ etat: 'erreur', message: e instanceof Error ? e.message : String(e) });
      }
    },
    [proposer],
  );

  // Vérification au lancement de l'application.
  useEffect(() => {
    if (verifiable()) verifier();
  }, [verifier]);

  // Web : l'appli installée peut rester ouverte des jours. On revérifie quand on revient sur la
  // fenêtre, et toutes les 30 minutes, pour proposer la mise à jour comme dans l'APK.
  useEffect(() => {
    if (!web || typeof document === 'undefined') return;
    let dernier = Date.now();
    const peutEtre = () => {
      if (document.visibilityState !== 'visible' || Date.now() - dernier < 5 * 60_000) return;
      dernier = Date.now();
      verifier(true);
    };
    document.addEventListener('visibilitychange', peutEtre);
    const minuterie = setInterval(() => {
      dernier = 0;
      peutEtre();
    }, 30 * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', peutEtre);
      clearInterval(minuterie);
    };
  }, [verifier]);

  return <MajCtx.Provider value={{ maj, verifier, installer }}>{children}</MajCtx.Provider>;
}
