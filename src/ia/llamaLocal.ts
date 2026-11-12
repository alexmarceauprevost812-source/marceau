/**
 * Version « site web » : les modèles .gguf ne tournent que dans l'APK Android (llama.cpp).
 * La vraie version est dans llamaLocal.native.ts (Metro la choisit sur Android et iOS).
 */

export type MessageLocal = { role: 'system' | 'user' | 'assistant'; content: string };

export type OptionsLocal = {
  messages: MessageLocal[];
  /** Reçoit le texte au fur et à mesure (affichage en direct). */
  onMorceau?: (texteComplet: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
};

export async function discuterLocal(_nomModele: string, _o: OptionsLocal): Promise<string> {
  throw new Error("Les modèles .gguf ne marchent que dans l'APK Android de Marceau, pas sur le site web.");
}

export async function libererModele(): Promise<void> {}
