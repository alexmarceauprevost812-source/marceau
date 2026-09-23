import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AssistantIA } from './src/components/AssistantIA';
import { ElementTache } from './src/components/ElementTache';
import { useTaches } from './src/hooks/useTaches';
import { useCouleurs } from './src/theme';
import type { Filtre } from './src/types';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'toutes', libelle: 'Toutes' },
  { cle: 'actives', libelle: 'À faire' },
  { cle: 'terminees', libelle: 'Terminées' },
];

function Ecran() {
  const couleurs = useCouleurs();
  const { taches, chargement, ajouter, ajouterPlusieurs, basculer, supprimer, viderTerminees } = useTaches();
  const [saisie, setSaisie] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [assistantOuvert, setAssistantOuvert] = useState(false);

  const visibles = useMemo(() => {
    if (filtre === 'actives') return taches.filter((t) => !t.terminee);
    if (filtre === 'terminees') return taches.filter((t) => t.terminee);
    return taches;
  }, [taches, filtre]);

  const restantes = taches.filter((t) => !t.terminee).length;
  const nbTerminees = taches.length - restantes;

  const valider = () => {
    ajouter(saisie);
    setSaisie('');
  };

  return (
    <SafeAreaView style={[styles.ecran, { backgroundColor: couleurs.fond }]}>
      <KeyboardAvoidingView
        style={styles.ecran}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.entete}>
          <View style={styles.ligneTitre}>
            <Text style={[styles.titre, { color: couleurs.texte }]}>Marceau</Text>
            <Pressable
              onPress={() => setAssistantOuvert(true)}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir l'assistant IA"
              style={({ pressed }) => [
                styles.boutonIA,
                { borderColor: couleurs.accent, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.boutonIATexte, { color: couleurs.accent }]}>✨ IA</Text>
            </Pressable>
          </View>
          <Text style={[styles.sousTitre, { color: couleurs.texteDoux }]}>
            {restantes === 0
              ? 'Rien à faire, profitez-en !'
              : `${restantes} tâche${restantes > 1 ? 's' : ''} à faire`}
          </Text>
        </View>

        <View style={styles.formulaire}>
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            onSubmitEditing={valider}
            placeholder="Ajouter une tâche…"
            placeholderTextColor={couleurs.texteDoux}
            returnKeyType="done"
            submitBehavior="submit"
            style={[
              styles.champ,
              { backgroundColor: couleurs.carte, borderColor: couleurs.bordure, color: couleurs.texte },
            ]}
          />
          <Pressable
            onPress={valider}
            disabled={!saisie.trim()}
            accessibilityRole="button"
            accessibilityLabel="Ajouter la tâche"
            style={({ pressed }) => [
              styles.bouton,
              { backgroundColor: couleurs.accent, opacity: !saisie.trim() ? 0.4 : pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.boutonTexte, { color: couleurs.surAccent }]}>+</Text>
          </Pressable>
        </View>

        <View style={styles.filtres}>
          {FILTRES.map(({ cle, libelle }) => {
            const actif = filtre === cle;
            return (
              <Pressable
                key={cle}
                onPress={() => setFiltre(cle)}
                accessibilityRole="tab"
                accessibilityState={{ selected: actif }}
                style={[
                  styles.puce,
                  { borderColor: couleurs.bordure },
                  actif && { backgroundColor: couleurs.accent, borderColor: couleurs.accent },
                ]}
              >
                <Text style={{ color: actif ? couleurs.surAccent : couleurs.texte, fontWeight: '600' }}>
                  {libelle}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {chargement ? (
          <ActivityIndicator style={styles.chargement} color={couleurs.accent} />
        ) : (
          <FlatList
            data={visibles}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.liste}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <ElementTache
                tache={item}
                couleurs={couleurs}
                onBasculer={basculer}
                onSupprimer={supprimer}
              />
            )}
            ListEmptyComponent={
              <Text style={[styles.vide, { color: couleurs.texteDoux }]}>
                {filtre === 'terminees' ? 'Aucune tâche terminée.' : 'Aucune tâche pour le moment.'}
              </Text>
            }
          />
        )}

        {nbTerminees > 0 && (
          <Pressable onPress={viderTerminees} style={styles.pied} accessibilityRole="button">
            <Text style={{ color: couleurs.danger, fontWeight: '600' }}>
              Effacer les tâches terminées ({nbTerminees})
            </Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
      <AssistantIA
        visible={assistantOuvert}
        couleurs={couleurs}
        onFermer={() => setAssistantOuvert(false)}
        onAjouter={(textes) => {
          ajouterPlusieurs(textes);
          setFiltre('toutes');
        }}
      />
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Ecran />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  entete: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titre: { fontSize: 32, fontWeight: '800' },
  boutonIA: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5 },
  boutonIATexte: { fontSize: 15, fontWeight: '700' },
  sousTitre: { fontSize: 15, marginTop: 4 },
  formulaire: { flexDirection: 'row', paddingHorizontal: 20, gap: 10 },
  champ: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  bouton: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boutonTexte: { fontSize: 26, fontWeight: '600', marginTop: -2 },
  filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  puce: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chargement: { marginTop: 40 },
  liste: { paddingHorizontal: 20, paddingBottom: 24 },
  vide: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  pied: { alignItems: 'center', paddingVertical: 14 },
});
