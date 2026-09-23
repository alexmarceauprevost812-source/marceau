import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

type EventSubscription = { remove(): void };

/** Informations sur ce que le téléphone permet. */
export type InfosTerminal = {
  abi: string;
  prootDisponible: boolean;
  linuxInstalle: boolean;
  termuxInstalle: boolean;
  termuxPermission: boolean;
  maison: string;
};

export type OptionsSsh = {
  hote: string;
  port?: number;
  utilisateur: string;
  motDePasse?: string;
  cle?: string;
  phrase?: string;
};

export type ResultatTermux = { stdout: string; stderr: string; code: number; erreur?: string | null };

type Evenements = {
  onSortie: (e: { id: string; donnees: string }) => void;
  onFin: (e: { id: string; code: number }) => void;
  onLinux: (e: { etape: string; pourcent: number }) => void;
};

type ModuleNatif = {
  infos(): InfosTerminal;
  ouvrirTelephone(id: string, colonnes: number, lignes: number): Promise<void>;
  installerLinux(): Promise<void>;
  supprimerLinux(): Promise<void>;
  ouvrirLinux(id: string, colonnes: number, lignes: number): Promise<void>;
  ouvrirSsh(id: string, options: OptionsSsh, colonnes: number, lignes: number): Promise<void>;
  oublierServeursSsh(): Promise<void>;
  ecrire(id: string, texte: string): Promise<void>;
  redimensionner(id: string, colonnes: number, lignes: number): void;
  fermer(id: string): void;
  termux(script: string, dossier: string): Promise<ResultatTermux>;
  ouvrirDansTermux(script: string): Promise<void>;
  addListener<K extends keyof Evenements>(nom: K, f: Evenements[K]): EventSubscription;
};

/**
 * Module natif du Terminal (Android seulement).
 * `null` sur iOS, sur le web et dans Expo Go : l'écran l'indique à l'utilisateur.
 */
export const Terminal: ModuleNatif | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<ModuleNatif>('MarceauTerminal') : null;
