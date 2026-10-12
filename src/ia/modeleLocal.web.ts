import { MODELES_LOCAUX, modeleLocal } from './catalogueLocal';
import { appelBureau, bureauLocalDisponible } from './bureauLocal';
import type { EtatLocal } from './modeleLocal';
export const MODELE_LOCAL = MODELES_LOCAUX[0];
const etats = new Map<string, EtatLocal>(MODELES_LOCAUX.map(m => [m.id,{ phase:'absent', progression:0, message:'Télécharge le modèle une fois sur ton PC ou ta clé USB.' }]));
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let actualisation: Promise<void> | null = null;
let stockage = '';
export const etatLocal = (id = MODELE_LOCAL.id) => etats.get(id) ?? etats.get(MODELE_LOCAL.id)!;
export const localDisponible = bureauLocalDisponible;
export function suivreLocal(fn: () => void) {
  listeners.add(fn);
  if (!timer && bureauLocalDisponible()) timer=setInterval(() => { void rafraichir().catch(() => {}); },1000);
  return () => { listeners.delete(fn); if (!listeners.size && timer) { clearInterval(timer);timer=null; } };
}
async function rafraichir() {
  if (actualisation) return actualisation;
  actualisation=(async () => {
    const reponse=await appelBureau('etat');
    const data=await reponse.json(); stockage=data.dossier;
    let change=false;
    for (const m of MODELES_LOCAUX) {
      const next=data.etats[m.id] as EtatLocal;
      if (JSON.stringify(next)!==JSON.stringify(etatLocal(m.id))) { etats.set(m.id,next); change=true; }
    }
    if (change) listeners.forEach(fn => fn());
  })().finally(() => { actualisation=null; });
  return actualisation;
}
export async function verifierModele(id = MODELE_LOCAL.id) {
  if (!bureauLocalDisponible()) return false;
  modeleLocal(id); await rafraichir(); return etatLocal(id).phase==='pret';
}
const installations = new Map<string, Promise<string>>();
export function installerModele(id = MODELE_LOCAL.id): Promise<string> {
  if (installations.has(id)) return installations.get(id)!;
  const promise=(async () => {
    modeleLocal(id); await appelBureau('installer',{modele:id});
    for (let n=0;n<7200;n++) {
      await rafraichir(); const state=etatLocal(id);
      if (state.phase==='pret') return id;
      if (state.phase==='erreur') throw new Error(state.message);
      await new Promise(resolve => setTimeout(resolve,1000));
    }
    throw new Error('Le téléchargement dépasse le délai. Vérifie sa progression dans les réglages.');
  })().finally(() => installations.delete(id));
  installations.set(id,promise); return promise;
}
export async function mettreEnPause() { /* Le téléchargement PC continue en arrière-plan. */ }
export function cheminModele(id = MODELE_LOCAL.id) { modeleLocal(id);return id; }
export async function dossierModelePC() { await rafraichir(); return stockage; }
export async function choisirDossierModelePC(dossier: string) { await appelBureau('dossier',{dossier}); await rafraichir(); }

export async function importerModeleDepuisUSB(_id: string): Promise<boolean> { return false; }
