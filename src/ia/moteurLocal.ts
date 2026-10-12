export type MessageLocal = { role: 'system' | 'user' | 'assistant'; content: string };
export type OptionsLocales = { modele: string; messages: MessageLocal[]; signal?: AbortSignal; onMorceau?: (texte: string) => void; maxTokens?: number };
export async function repondreLocal(_options: OptionsLocales): Promise<string> {
  throw new Error('L’IA embarquée est disponible dans l’APK Android et l’application iOS. Sur PC, utilise Ollama.');
}
