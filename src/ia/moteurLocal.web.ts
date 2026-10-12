import { appelBureau } from './bureauLocal';
import type { OptionsLocales } from './moteurLocal';
export async function repondreLocal(o: OptionsLocales): Promise<string> {
  const reponse=await appelBureau('generer',{modele:o.modele,messages:o.messages,maxTokens:o.maxTokens ?? 768},o.signal);
  if (!reponse.body) throw new Error('Réponse locale vide.');
  const reader=reponse.body.getReader();const decoder=new TextDecoder();let buffer='',texte='',fini=false;
  try {
    for (;;) {
      const { value,done }=await reader.read(); if(done) break;
      buffer+=decoder.decode(value,{stream:true});
      const lignes=buffer.split('\n');buffer=lignes.pop() || '';
      for(const ligne of lignes) {
        if(!ligne.trim()) continue;
        const data=JSON.parse(ligne);
        if(data.error) throw new Error(data.error);
        if(typeof data.text==='string') { texte=data.text; o.onMorceau?.(texte); }
        if(data.done) fini=true;
      }
    }
  } finally { reader.releaseLock(); }
  if(!fini) throw new Error('Le moteur local a interrompu sa réponse. Réessaie.');
  return texte;
}
