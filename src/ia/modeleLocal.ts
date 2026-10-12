import { Platform, AppState } from 'react-native';
import * as FS from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';

import { MODELES_LOCAUX, modeleLocal } from './catalogueLocal';
export const MODELE_LOCAL = MODELES_LOCAUX[0];
export type EtatLocal = { phase: 'absent' | 'verification' | 'telechargement' | 'pause' | 'pret' | 'erreur'; progression: number; message: string };
const etats = new Map<string, EtatLocal>(MODELES_LOCAUX.map(m => [m.id,
  { phase: 'absent', progression: 0, message: `Télécharge une fois le modèle (${(m.taille/1e9).toFixed(2)} Go), puis utilise-le hors ligne.` }]));
const ecouteurs = new Set<() => void>();
export const etatLocal = (id = MODELE_LOCAL.id as string) => etats.get(id) ?? etats.get(MODELE_LOCAL.id)!;
export function suivreLocal(fn: () => void) { ecouteurs.add(fn); return () => { ecouteurs.delete(fn); }; }
function changer(id: string, patch: Partial<EtatLocal>) {
  if (patch.progression !== undefined && patch.phase === undefined && Math.abs(patch.progression-etatLocal(id).progression)<0.005) return;
  etats.set(id, { ...etatLocal(id), ...patch }); ecouteurs.forEach(fn => fn());
}
export const localDisponible = () => Platform.OS === 'android' || Platform.OS === 'ios';
const cleReprise = (id: string) => 'marceau:modele-local:reprise:' + id;
let idInstallation: string | null = null;
let installation: Promise<string> | null = null;
let transfert: FS.DownloadResumable | null = null;
let demandePause = false;
function dossier() {
  if (!localDisponible() || !FS.documentDirectory) throw new Error('L’IA embarquée nécessite l’application Android ou iOS. Sur PC, utilise Ollama.');
  return FS.documentDirectory + 'ia-locale/';
}
export function cheminModele(id = MODELE_LOCAL.id as string) { return dossier() + modeleLocal(id).id + '.gguf'; }
async function valide(uri: string, taille: number): Promise<boolean> {
  const info = await FS.getInfoAsync(uri);
  if (!info.exists || info.isDirectory || info.size !== taille) return false;
  return (await FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64, position: 0, length: 4 })) === 'R0dVRg==';
}
export async function verifierModele(id = MODELE_LOCAL.id as string): Promise<boolean> {
  const modele = modeleLocal(id);
  if (installation && idInstallation === id) return etatLocal(id).phase === 'pret';
  if (!localDisponible()) return false;
  const ok = await valide(cheminModele(id), modele.taille).catch(() => false);
  changer(id, ok ? { phase: 'pret', progression: 1, message: 'Modèle installé. Chat et Codex peuvent fonctionner hors ligne.' } :
    { phase: (await AsyncStorage.getItem(cleReprise(id))) ? 'pause' : 'absent', progression: 0, message: 'Télécharge le modèle une seule fois, puis utilise-le hors ligne.' });
  return ok;
}
export async function mettreEnPause(): Promise<void> {
  if (!transfert || !idInstallation || etatLocal(idInstallation).phase !== 'telechargement') return;
  const id = idInstallation;
  demandePause = true;
  try {
    const reprise = await transfert.pauseAsync();
    await AsyncStorage.setItem(cleReprise(id), JSON.stringify(reprise));
    changer(id, { phase: 'pause', message: 'Téléchargement en pause. Touche Reprendre pour continuer.' });
  } catch {
    demandePause = false;
    changer(id, { message: 'Impossible de mettre en pause pour le moment.' });
  }
}
export function installerModele(id = MODELE_LOCAL.id as string): Promise<string> {
  modeleLocal(id);
  if (installation) return id === idInstallation ? installation : Promise.reject(new Error('Un autre modèle est en cours de téléchargement. Attends sa fin.'));
  idInstallation = id;
  installation = installer(id).finally(() => { installation = null; transfert = null; idInstallation = null; });
  return installation;
}
async function installer(id: string): Promise<string> {
  const modele = modeleLocal(id);
  const cible = cheminModele(id), temporaire = cible + '.part';
  demandePause = false;
  try {
    changer(id, { phase: 'verification', message: 'Vérification du stockage…' });
    await FS.makeDirectoryAsync(dossier(), { intermediates: true });
    if (await valide(cible, modele.taille)) {
      changer(id, { phase: 'pret', progression: 1, message: 'Modèle déjà installé, prêt hors ligne.' }); return cible;
    }
    const libre = await FS.getFreeDiskStorageAsync();
    const info = await FS.getInfoAsync(temporaire);
    const deja = info.exists && !info.isDirectory ? info.size : 0;
    if (libre < modele.taille - deja + 300_000_000) throw new Error('Pas assez d’espace : libère assez d’espace sur le téléphone pour le modèle choisi et 300 Mo supplémentaires.');
    const brut = await AsyncStorage.getItem(cleReprise(id));
    let reprise: string | undefined;
    if (brut) {
      try {
        const saved = JSON.parse(brut);
        if (saved.url === modele.url && saved.fileUri === temporaire && deja > 0) reprise = saved.resumeData;
      } catch { /* reprendre depuis le début */ }
    }
    if (!reprise) await FS.deleteAsync(temporaire, { idempotent: true });
    changer(id, { phase: 'telechargement', progression: 0, message: 'Téléchargement du modèle. Garde Marceau ouvert.' });
    transfert = FS.createDownloadResumable(modele.url, temporaire, {}, p => {
      changer(id, { progression: Math.min(1, p.totalBytesWritten / modele.taille) });
    }, reprise);
    const resultat = reprise ? await transfert.resumeAsync() : await transfert.downloadAsync();
    if (demandePause || !resultat) throw new Error('Téléchargement en pause.');
    if (resultat.status !== 200 && resultat.status !== 206) throw new Error('Le serveur a refusé le téléchargement. Réessaie.');
    changer(id, { phase: 'verification', message: 'Vérification du fichier téléchargé…' });
    if (!(await valide(temporaire, modele.taille))) {
      await AsyncStorage.removeItem(cleReprise(id)); await FS.deleteAsync(temporaire, { idempotent: true });
      throw new Error('Modèle incomplet ou fichier GGUF invalide. Relance le téléchargement.');
    }
    await FS.deleteAsync(cible, { idempotent: true });
    await FS.moveAsync({ from: temporaire, to: cible });
    await AsyncStorage.removeItem(cleReprise(id));
    changer(id, { phase: 'pret', progression: 1, message: 'Installation terminée. L’IA fonctionne maintenant sans Internet.' });
    return cible;
  } catch (error) {
    if (!demandePause) changer(id, { phase: 'erreur', message: error instanceof Error ? error.message : 'Téléchargement interrompu. Réessaie.' });
    throw error;
  }
}

AppState.addEventListener('change', state => { if (state !== 'active') void mettreEnPause(); });

export async function dossierModelePC(): Promise<string> { return ''; }
export async function choisirDossierModelePC(_dossier: string): Promise<void> { throw new Error('Ce réglage concerne le PC.'); }

export async function importerModeleDepuisUSB(id: string): Promise<boolean> {
  if (installation) throw new Error('Attends la fin de l’installation en cours.');
  const modele = modeleLocal(id), cible = cheminModele(id);
  if (await valide(cible, modele.taille)) return true;
  if (await FS.getFreeDiskStorageAsync() < modele.taille + 300_000_000) throw new Error('Espace libre insuffisant sur le téléphone.');
  const fichier = await DocumentPicker.getDocumentAsync({ multiple: false, type: '*/*', copyToCacheDirectory: true });
  if (fichier.canceled) return false;
  const asset = fichier.assets[0];
  const copieCache = !!FS.cacheDirectory && asset.uri.startsWith(FS.cacheDirectory);
  const temporaire = cible + '.import';
  try {
    changer(id, { phase: 'verification', message: 'Importation du modèle depuis ta clé…' });
    if (!asset.name.toLowerCase().endsWith('.gguf') || !(await valide(asset.uri, modele.taille))) throw new Error('Ce fichier ne correspond pas au modèle choisi. Sélectionne le bon fichier GGUF.');
    await FS.makeDirectoryAsync(dossier(), { intermediates: true });
    await FS.deleteAsync(temporaire, { idempotent: true });
    if (copieCache) await FS.moveAsync({ from: asset.uri, to: temporaire });
    else await FS.copyAsync({ from: asset.uri, to: temporaire });
    await FS.deleteAsync(cible, { idempotent: true });
    await FS.moveAsync({ from: temporaire, to: cible });
    changer(id, { phase: 'pret', progression: 1, message: 'Modèle importé. Prêt sans Internet.' });
    return true;
  } catch (error) {
    changer(id, { phase: 'erreur', message: error instanceof Error ? error.message : 'Importation impossible.' });
    await FS.deleteAsync(temporaire, { idempotent: true });
    throw error;
  } finally { if (copieCache) await FS.deleteAsync(asset.uri, { idempotent: true }); }
}
