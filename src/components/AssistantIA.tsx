import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { proposerTaches } from '../ia/client';
import { FOURNISSEURS, reglagesParDefaut, type IdFournisseur, type ReglagesIA } from '../ia/fournisseurs';
import { useReglagesIA } from '../hooks/useReglagesIA';
import type { Couleurs } from '../theme';

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  onFermer: () => void;
  onAjouter: (textes: string[]) => void;
};

type Vue = 'assistant' | 'reglages';

export function AssistantIA({ visible, couleurs: c, onFermer, onAjouter }: Props) {
  const { reglages, pret, enregistrer } = useReglagesIA();
  const [vue, setVue] = useState<Vue>('assistant');
  const [brouillon, setBrouillon] = useState<ReglagesIA>(reglages);
  const [objectif, setObjectif] = useState('');
  const [propositions, setPropositions] = useState<{ texte: string; choisie: boolean }[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  const manqueCle = FOURNISSEURS[reglages.fournisseur].besoinCle && !reglages.cle.trim();

  useEffect(() => {
    if (visible && pret) {
      setBrouillon(reglages);
      setVue(manqueCle ? 'reglages' : 'assistant');
    }
    // on ne réagit qu'à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pret]);

  const fermer = () => {
    setErreur('');
    onFermer();
  };

  const demander = async () => {
    if (!objectif.trim() || enCours) return;
    setEnCours(true);
    setErreur('');
    setPropositions([]);
    try {
      const taches = await proposerTaches(reglages, objectif);
      setPropositions(taches.map((texte) => ({ texte, choisie: true })));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(false);
    }
  };

  const choisies = propositions.filter((p) => p.choisie).map((p) => p.texte);

  const ajouter = () => {
    if (!choisies.length) return;
    onAjouter(choisies);
    setPropositions([]);
    setObjectif('');
    fermer();
  };

  const changerFournisseur = (id: IdFournisseur) => {
    if (id === brouillon.fournisseur) return;
    setBrouillon({ ...reglagesParDefaut(id), cle: id === 'opencode' ? reglages.cle : '' });
  };

  const sauver = async () => {
    await enregistrer(brouillon);
    setErreur('');
    setVue('assistant');
  };

  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];
  const fournisseur = FOURNISSEURS[brouillon.fournisseur];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={fermer}>
      <SafeAreaView style={[styles.ecran, { backgroundColor: c.fond }]}>
        <KeyboardAvoidingView style={styles.ecran} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.barre}>
            <Pressable onPress={fermer} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.lien, { color: c.accentTexte }]}>Fermer</Text>
            </Pressable>
            <Text style={[styles.titreBarre, { color: c.texte }]}>
              {vue === 'assistant' ? 'Assistant IA' : 'Réglages IA'}
            </Text>
            <Pressable
              onPress={() => (vue === 'assistant' ? (setBrouillon(reglages), setVue('reglages')) : sauver())}
              hitSlop={12}
              accessibilityRole="button"
            >
              <Text style={[styles.lien, { color: c.accentTexte }]}>{vue === 'assistant' ? 'Réglages' : 'Enregistrer'}</Text>
            </Pressable>
          </View>

          {vue === 'assistant' ? (
            <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
              <Text style={[styles.aide, { color: c.texteDoux }]}>
                Décris ce que tu veux accomplir : l'IA le découpe en tâches.{'\n'}
                {FOURNISSEURS[reglages.fournisseur].nom} · {reglages.modele}
              </Text>
              <TextInput
                value={objectif}
                onChangeText={setObjectif}
                placeholder="Ex. : organiser la fête de papa samedi"
                placeholderTextColor={c.texteDoux}
                multiline
                style={[...champ, styles.zoneObjectif]}
                accessibilityLabel="Objectif"
              />
              <Pressable
                onPress={demander}
                disabled={!objectif.trim() || enCours || manqueCle}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.bouton,
                  { backgroundColor: c.accent, opacity: !objectif.trim() || manqueCle ? 0.4 : pressed ? 0.8 : 1 },
                ]}
              >
                {enCours ? (
                  <ActivityIndicator color={c.surAccent} />
                ) : (
                  <Text style={[styles.boutonTexte, { color: c.surAccent }]}>Proposer des tâches</Text>
                )}
              </Pressable>

              {manqueCle && (
                <Text style={[styles.message, { color: c.danger }]}>
                  Ajoute ta clé OpenCode gratuite dans Réglages.
                </Text>
              )}
              {!!erreur && <Text style={[styles.message, { color: c.danger }]}>{erreur}</Text>}

              {propositions.map((p, i) => (
                <Pressable
                  key={`${i}-${p.texte}`}
                  onPress={() =>
                    setPropositions((prev) => prev.map((x, j) => (j === i ? { ...x, choisie: !x.choisie } : x)))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: p.choisie }}
                  style={[styles.ligne, { backgroundColor: c.carte, borderColor: c.bordure }]}
                >
                  <View style={[styles.case, { borderColor: c.accentTexte }, p.choisie && { backgroundColor: c.accent }]}>
                    {p.choisie && <Text style={{ color: c.surAccent, fontWeight: '700' }}>✓</Text>}
                  </View>
                  <Text style={[styles.texteLigne, { color: c.texte }]}>{p.texte}</Text>
                </Pressable>
              ))}

              {propositions.length > 0 && (
                <Pressable
                  onPress={ajouter}
                  disabled={!choisies.length}
                  accessibilityRole="button"
                  style={[styles.bouton, { backgroundColor: c.accent, opacity: choisies.length ? 1 : 0.4 }]}
                >
                  <Text style={[styles.boutonTexte, { color: c.surAccent }]}>
                    Ajouter {choisies.length} tâche{choisies.length > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
              <Text style={[styles.etiquette, { color: c.texteDoux }]}>FOURNISSEUR</Text>
              <View style={styles.puces}>
                {(Object.keys(FOURNISSEURS) as IdFournisseur[]).map((id) => {
                  const actif = brouillon.fournisseur === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => changerFournisseur(id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: actif }}
                      style={[
                        styles.puce,
                        { borderColor: c.bordure },
                        actif && { backgroundColor: c.accent, borderColor: c.accent },
                      ]}
                    >
                      <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '600' }}>
                        {FOURNISSEURS[id].nom}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.aide, { color: c.texteDoux }]}>{fournisseur.description}</Text>

              <Text style={[styles.etiquette, { color: c.texteDoux }]}>ADRESSE DU SERVEUR</Text>
              <TextInput
                value={brouillon.url}
                onChangeText={(url) => setBrouillon({ ...brouillon, url })}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={champ}
                accessibilityLabel="Adresse du serveur"
              />

              <Text style={[styles.etiquette, { color: c.texteDoux }]}>MODÈLE</Text>
              <TextInput
                value={brouillon.modele}
                onChangeText={(modele) => setBrouillon({ ...brouillon, modele })}
                autoCapitalize="none"
                autoCorrect={false}
                style={champ}
                accessibilityLabel="Modèle"
              />
              <View style={styles.puces}>
                {fournisseur.modelesSuggeres.map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setBrouillon({ ...brouillon, modele: m })}
                    style={[styles.puceMini, { borderColor: c.bordure }]}
                  >
                    <Text style={{ color: c.texte, fontSize: 13 }}>{m}</Text>
                  </Pressable>
                ))}
              </View>

              {fournisseur.besoinCle && (
                <>
                  <Text style={[styles.etiquette, { color: c.texteDoux }]}>CLÉ API (GRATUITE)</Text>
                  <TextInput
                    value={brouillon.cle}
                    onChangeText={(cle) => setBrouillon({ ...brouillon, cle })}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    placeholder="sk-…"
                    placeholderTextColor={c.texteDoux}
                    style={champ}
                    accessibilityLabel="Clé API"
                  />
                  <Pressable onPress={() => Linking.openURL('https://opencode.ai/auth')} accessibilityRole="link">
                    <Text style={[styles.lien, { color: c.accentTexte, marginTop: 8 }]}>Obtenir une clé gratuite →</Text>
                  </Pressable>
                  <Text style={[styles.aide, { color: c.texteDoux, marginTop: 8 }]}>
                    La clé reste dans le coffre sécurisé de ton téléphone.
                  </Text>
                </>
              )}

              <Pressable
                onPress={sauver}
                accessibilityRole="button"
                style={[styles.bouton, { backgroundColor: c.accent }]}
              >
                <Text style={[styles.boutonTexte, { color: c.surAccent }]}>Enregistrer</Text>
              </Pressable>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  barre: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  titreBarre: { fontSize: 17, fontWeight: '700' },
  lien: { fontSize: 16, fontWeight: '600' },
  contenu: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  aide: { fontSize: 14, lineHeight: 20 },
  etiquette: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 12 },
  champ: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  zoneObjectif: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  bouton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  boutonTexte: { fontSize: 16, fontWeight: '700' },
  message: { fontSize: 14, lineHeight: 20 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  case: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  texteLigne: { flex: 1, fontSize: 16 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  puceMini: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
});
