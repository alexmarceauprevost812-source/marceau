import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import type { Couleurs } from '../theme';
import { MODELES_LOCAUX } from './catalogueLocal';
import { etatLocal, suivreLocal, verifierModele, installerModele, mettreEnPause, localDisponible, dossierModelePC, choisirDossierModelePC, importerModeleDepuisUSB } from './modeleLocal';

export function InstallationLocale({ couleurs: c, modele, onModele, onPret }: {
  couleurs: Couleurs; modele: string; onModele: (id: string) => void; onPret: (id: string) => Promise<void>;
}) {
  const etat = useSyncExternalStore(suivreLocal, () => etatLocal(modele));
  const [activation, setActivation] = useState(false);
  const [erreur, setErreur] = useState('');
  const [dossier, setDossier] = useState('');
  useEffect(() => { if (Platform.OS === 'web' && localDisponible()) void dossierModelePC().then(setDossier).catch(() => {}); }, []);
  useEffect(() => { void verifierModele(modele).catch(() => {}); }, [modele]);
  const occupe = etat.phase === 'telechargement' || etat.phase === 'verification' || activation;
  const installer = async () => {
    const choisi = modele;
    setErreur('');
    try {
      await installerModele(choisi);
      setActivation(true);
      await onPret(choisi);
    } catch (e) {
      if (etatLocal(choisi).phase !== 'pause') setErreur(e instanceof Error ? e.message : 'Installation interrompue. Réessaie.');
    } finally { setActivation(false); }
  };
  if (!localDisponible()) return <Text style={{ color: c.texteDoux }}>L’IA embarquée fonctionne dans l’application Android ou iOS. Sur ordinateur, choisis Ollama.</Text>;
  return <View style={{ gap: 12, paddingVertical: 12 }}>
    {Platform.OS === 'web' && <View style={{ gap: 8 }}>
      <Text style={{ color: c.texte, fontWeight: '700' }}>Dossier des modèles sur le PC ou la clé USB</Text>
      <TextInput value={dossier} onChangeText={setDossier} autoCorrect={false} autoCapitalize="none" accessibilityLabel="Chemin du dossier des modèles"
        style={{ color: c.texte, padding: 14, borderWidth: 1, borderColor: c.bordure, borderRadius: 12, backgroundColor: c.carte }} />
      <Pressable accessibilityRole="button" onPress={() => { void choisirDossierModelePC(dossier).then(() => { setErreur(''); }).catch(e => setErreur((e as Error).message)); }} style={{ padding: 14 }}>
        <Text style={{ color: c.accentTexte }}>Utiliser ce dossier</Text>
      </Pressable>
    </View>}
    {MODELES_LOCAUX.map(m => <Pressable key={m.id} onPress={() => { onModele(m.id); setErreur(''); }} disabled={occupe}
      accessibilityRole="radio" accessibilityState={{ selected: modele === m.id, disabled: occupe }}
      style={{ padding: 16, borderWidth: 2, borderRadius: 16, borderColor: modele === m.id ? c.accent : c.bordure, backgroundColor: c.carte }}>
      <Text style={{ color: c.texte, fontSize: 17, fontWeight: '700' }}>{m.nom}</Text>
      <Text style={{ color: c.texteDoux, marginTop: 6 }}>{(m.taille/1e9).toFixed(2).replace('.', ',')} Go · gratuit · {m.licence}</Text>
      <Text style={{ color: c.texteDoux, marginTop: 6 }}>{m.description}</Text>
    </Pressable>)}
    <Text accessibilityLiveRegion="polite" style={{ color: etat.phase === 'erreur' ? c.danger : c.texte }}>{etat.message}</Text>
    {etat.phase === 'telechargement' && <>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: c.bordure }}><View style={{ height: 10, borderRadius: 5, width: `${Math.round(etat.progression*100)}%`, backgroundColor: c.accent }} /></View>
      <Text style={{ color: c.texteDoux }}>{Math.round(etat.progression*100)} %</Text>
      {Platform.OS !== 'web' && <Pressable onPress={() => void mettreEnPause()} accessibilityRole="button" style={{ padding: 14 }}><Text style={{ color: c.accentTexte }}>Mettre en pause</Text></Pressable>}
    </>}
    <Pressable onPress={() => void installer()} disabled={occupe} accessibilityRole="button" accessibilityState={{ disabled: occupe }}
      style={{ minHeight: 52, padding: 16, borderRadius: 14, backgroundColor: c.accent, opacity: occupe ? 0.6 : 1, flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
      {occupe && <ActivityIndicator color={c.surAccent} />}
      <Text style={{ color: c.surAccent, fontWeight: '800' }}>{activation ? 'Activation…' : occupe ? 'Installation en cours…' : etat.phase === 'pret' ? 'Utiliser cette IA locale' : etat.phase === 'pause' ? 'Reprendre et activer' : 'Installer et activer l’IA locale'}</Text>
    </Pressable>
    {Platform.OS !== 'web' && <Pressable accessibilityRole="button" disabled={occupe} accessibilityState={{ disabled: occupe }}
      style={{ padding: 16, borderWidth: 1, borderRadius: 14, borderColor: c.bordure, opacity: occupe ? 0.6 : 1 }}
      onPress={() => {
        const choisi=modele; setActivation(true);setErreur('');
        void importerModeleDepuisUSB(choisi).then(async ok => { if(ok) await onPret(choisi); })
          .catch(e => setErreur((e as Error).message)).finally(() => setActivation(false));
      }}><Text style={{ color: c.accentTexte, fontWeight: '700' }}>Importer le modèle depuis ma clé USB</Text></Pressable>}
    {!!erreur && <Text style={{ color: c.danger }}>{erreur}</Text>}
    <Text style={{ color: c.texteDoux }}>Internet est nécessaire pour le téléchargement. Ensuite, le modèle reste sur cet appareil. Chat et Codex peuvent partager le même modèle ; un seul est chargé en mémoire.</Text>
  </View>;
}
