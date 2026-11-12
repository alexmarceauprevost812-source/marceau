import { Platform, requireNativeModule } from 'expo-modules-core';

type Natif = {
  disponible(): boolean;
  bootstrapInstalle(): boolean;
  ouvrir(): void;
};

/** Le terminal LexOS (moteur Termux) n'existe que dans l'APK Android. */
let natif: Natif | null = null;
if (Platform.OS === 'android') {
  try {
    natif = requireNativeModule<Natif>('LexosTerminal');
  } catch {
    natif = null;
  }
}

export const lexosDisponible = (): boolean => !!natif?.disponible();
export const lexosBootstrapInstalle = (): boolean => !!natif?.bootstrapInstalle();
export function ouvrirLexos(): void {
  if (!natif) throw new Error("Le terminal LexOS n'est pas dans cette version de l'appli.");
  natif.ouvrir();
}
