import { AppState } from 'react-native';
import { initLlama, type LlamaContext } from 'llama.rn';
import { cheminModele, verifierModele } from './modeleLocal';
import type { OptionsLocales } from './moteurLocal';

let contexte: LlamaContext | null = null;
let occupe = false;
let modeleCharge = '';
AppState.addEventListener('change', state => {
  if (state !== 'active' && contexte) {
    if (occupe) void contexte.stopCompletion().catch(() => {});
    else { const ancien = contexte; contexte = null; void ancien.release().catch(() => {}); }
  }
});
export async function repondreLocal(o: OptionsLocales): Promise<string> {
  if (occupe) throw new Error('L’IA locale termine déjà une réponse. Attends ou annule-la.');
  occupe = true;
  let texte = '';
  let interrompu = false;
  const arreter = () => { interrompu = true; if (contexte) void contexte.stopCompletion().catch(() => {}); };
  try {
    if (o.signal?.aborted) throw new DOMException('Demande annulée.', 'AbortError');
    if (!(await verifierModele(o.modele))) throw new Error('Installe d’abord l’IA locale dans Réglages IA.');
    if (contexte && modeleCharge !== o.modele) { await contexte.release(); contexte = null; }
    if (!contexte) {
      contexte = await initLlama({ model: cheminModele(o.modele), n_ctx: 4096, n_gpu_layers: 0, n_threads: 4, use_mlock: false });
      modeleCharge = o.modele;
    }
    if (o.signal?.aborted) throw new DOMException('Demande annulée.', 'AbortError');
    const messages = [...o.messages];
    const formatted = await contexte.getFormattedChat(messages, null, { enable_thinking: false });
    const compte = await contexte.tokenize(formatted.prompt);
    const reserve = Math.min(1024, Math.max(128, o.maxTokens ?? 768));
    if (compte.tokens.length + reserve > 4096) throw new Error('Le texte dépasse le contexte de l’IA du téléphone. Ouvre une nouvelle discussion ou travaille sur un fichier plus court.');
    if (o.signal?.aborted || AppState.currentState !== 'active') throw new DOMException('Demande annulée.', 'AbortError');
    o.signal?.addEventListener('abort', arreter, { once: true });
    const resultat = await contexte.completion({ messages, enable_thinking: false, n_predict: reserve,
      temperature: 0.6, stop: ['<|im_end|>', '<|endoftext|>'] }, data => {
      texte += data.token; o.onMorceau?.(texte);
    });
    if (interrompu || o.signal?.aborted) throw new DOMException('Demande annulée.', 'AbortError');
    texte = resultat.content || resultat.text || texte;
    if (!texte.trim()) throw new Error('Le modèle n’a pas produit de réponse. Réessaie avec une demande plus courte.');
    o.onMorceau?.(texte); return texte;
  } finally {
    o.signal?.removeEventListener('abort', arreter);
    occupe = false;
    if (AppState.currentState !== 'active' && contexte) {
      const ancien = contexte; contexte = null; await ancien.release().catch(() => {});
    }
  }
}
