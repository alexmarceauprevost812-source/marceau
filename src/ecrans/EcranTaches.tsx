import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { AssistantIA } from '../components/AssistantIA';
import { EcranChat } from './EcranChat';
import { ElementTache } from '../components/ElementTache';
import { effacerPersistant, lirePersistant, nouvelId, usePersistant } from '../hooks/usePersistant';
import { useTaches } from '../hooks/useTaches';
import { supprimerPieces } from '../ia/pieces';
import { annulerRappel } from '../rappels/notifications';
import type { Conversation } from '../types';
import { BoutonBureau, BoutonMenu } from '../navigation/Menu';
import type { Couleurs } from '../theme';
import type { Filtre, Tache } from '../types';
import { ChoixRappel } from '../rappels/ChoixRappel';

const FILTRES: { cle: Filtre; libelle: string }[] = [
  { cle: 'toutes', libelle: 'Toutes' },
  { cle: 'actives', libelle: 'À faire' },
  { cle: 'terminees', libelle: 'Terminées' },
];

/** Un projet : un nom, avec ses propres tâches et ses propres discussions. */
type ProjetT = { id: string; nom: string };
const PROJET_DEFAUT: ProjetT = { id: 'defaut', nom: 'Mon projet' };
// Le projet par défaut garde les anciennes clés (pas de perte des tâches déjà là).
const cleTaches = (id: string) => (id === 'defaut' ? 'marceau:taches' : `marceau:taches:${id}`);
const cleConversations = (id: string) => (id === 'defaut' ? 'marceau:projet-conversations' : `marceau:projet-conv:${id}`);

/** Écran Projet : plusieurs projets, chacun avec ses tâches et ses discussions. */
export function EcranTaches({ couleurs }: { couleurs: Couleurs }) {
  const [projets, setProjets] = usePersistant<ProjetT[]>('marceau:taches-projets', [PROJET_DEFAUT]);
  const [projetActif, setProjetActif] = usePersistant('marceau:taches-projet-actif', 'defaut');
  // Le projet choisi existe toujours (sinon on retombe sur le premier).
  const projet = projets.find((p) => p.id === projetActif) ?? projets[0] ?? PROJET_DEFAUT;

  const { taches, chargement, ajouter, ajouterPlusieurs, basculer, supprimer, viderTerminees, definirRappel } =
    useTaches(cleTaches(projet.id));
  const [tacheRappel, setTacheRappel] = useState<Tache | null>(null);
  const [saisie, setSaisie] = useState('');
  const [filtre, setFiltre] = useState<Filtre>('toutes');
  const [assistantOuvert, setAssistantOuvert] = useState(false);
  // Deux façons d'avancer le projet : des tâches, ou des conversations avec l'IA.
  const [vue, setVue] = useState<'taches' | 'discussions'>('taches');

  // Projet en cours de renommage (appui long sur son onglet) et le texte tapé.
  const [renommer, setRenommer] = useState<ProjetT | null>(null);
  const [nomEdit, setNomEdit] = useState('');

  const nouveauProjet = () => {
    const p: ProjetT = { id: nouvelId(), nom: `Projet ${projets.length + 1}` };
    setProjets((liste) => [...liste, p]);
    setProjetActif(p.id);
    setVue('taches');
  };

  const ouvrirRenommage = (p: ProjetT) => {
    setRenommer(p);
    setNomEdit(p.nom);
  };

  const validerRenommage = () => {
    if (!renommer) return;
    const nom = nomEdit.trim();
    if (nom) setProjets((liste) => liste.map((x) => (x.id === renommer.id ? { ...x, nom } : x)));
    setRenommer(null);
  };

  const supprimerProjet = (p: ProjetT) => {
    if (projets.length <= 1) {
      Alert.alert('Impossible', 'Il faut garder au moins un projet.');
      return;
    }
    Alert.alert('Supprimer ce projet ?', `« ${p.nom} » et ses tâches seront retirés du menu.`, [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          // Nettoie tout ce qui appartient au projet supprimé.
          try {
            // Tâches : annuler leurs rappels, puis effacer leur clé.
            const brut = await AsyncStorage.getItem(cleTaches(p.id));
            const taches: Tache[] = brut ? JSON.parse(brut) : [];
            await Promise.all(taches.map((t) => annulerRappel(t.rappel?.id)));
            await AsyncStorage.removeItem(cleTaches(p.id));
            // Discussions : supprimer les pièces jointes (images, PDF) puis leur stockage.
            const convs = (await lirePersistant<Conversation[]>(cleConversations(p.id))) ?? [];
            supprimerPieces(convs.flatMap((c) => c.messages.flatMap((m) => m.pieces ?? [])));
            await effacerPersistant(cleConversations(p.id));
          } catch {
            // le projet est retiré quand même
          }
          setProjets((liste) => liste.filter((x) => x.id !== p.id));
          if (projetActif === p.id) setProjetActif(projets.find((x) => x.id !== p.id)?.id ?? 'defaut');
          setRenommer(null);
        },
      },
    ]);
  };

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
    <View style={styles.ecran}>
      <KeyboardAvoidingView
        style={styles.ecran}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.entete}>
          <View style={styles.ligneTitre}>
            <BoutonMenu couleurs={couleurs} />
            <Text numberOfLines={1} style={[styles.titre, styles.titreFlex, { color: couleurs.texte }]}>
              {projet.nom}
            </Text>
            <Pressable
              onPress={() => setAssistantOuvert(true)}
              accessibilityRole="button"
              accessibilityLabel="Ouvrir l'assistant IA"
              style={({ pressed }) => [
                styles.boutonIA,
                { backgroundColor: couleurs.accent, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.boutonIATexte, { color: couleurs.surAccent }]}>✨ IA</Text>
            </Pressable>
            <BoutonBureau couleurs={couleurs} />
          </View>
          <Text style={[styles.sousTitre, { color: couleurs.texteDoux }]}>
            {restantes === 0
              ? 'Rien à faire, profitez-en !'
              : `${restantes} tâche${restantes > 1 ? 's' : ''} à faire`}
          </Text>
        </View>

        {/* Choix du projet : chaque projet a ses tâches et ses discussions. Appui long = renommer/supprimer. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.projets}
        >
          {projets.map((p) => {
            const actif = p.id === projet.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setProjetActif(p.id)}
                onLongPress={() => ouvrirRenommage(p)}
                accessibilityRole="button"
                accessibilityLabel={`Projet ${p.nom}`}
                accessibilityHint="Appui long pour renommer ou supprimer"
                style={[styles.puceProjet, { borderColor: couleurs.bordure }, actif && { backgroundColor: couleurs.accent, borderColor: couleurs.accent }]}
              >
                <Text numberOfLines={1} style={{ color: actif ? couleurs.surAccent : couleurs.texte, fontWeight: '700', maxWidth: 160 }}>
                  {p.nom}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={nouveauProjet}
            accessibilityRole="button"
            accessibilityLabel="Nouveau projet"
            style={[styles.puceProjet, { borderColor: couleurs.accent }]}
          >
            <Text style={{ color: couleurs.accentTexte, fontWeight: '800' }}>＋ Projet</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.onglets}>
          {(['taches', 'discussions'] as const).map((v) => {
            const actif = vue === v;
            return (
              <Pressable
                key={v}
                onPress={() => setVue(v)}
                accessibilityRole="tab"
                accessibilityState={{ selected: actif }}
                style={[styles.onglet, { borderColor: couleurs.bordure }, actif && { backgroundColor: couleurs.accent, borderColor: couleurs.accent }]}
              >
                <Text style={{ color: actif ? couleurs.surAccent : couleurs.texte, fontWeight: '700' }}>
                  {v === 'taches' ? '✅ Tâches' : '💬 Discussions'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {vue === 'discussions' ? (
          <EcranChat
            key={projet.id}
            couleurs={couleurs}
            embarque
            cleStockage={cleConversations(projet.id)}
            titreListe="Discussions du projet"
            systemeSup={`Tu aides à faire avancer le projet « ${projet.nom} ». Sois concret : propose les prochaines étapes, et quand c'est utile, une courte liste de tâches à faire.`}
          />
        ) : (
          <>
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
          <ActivityIndicator style={styles.chargement} color={couleurs.accentTexte} />
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
                onRappel={setTacheRappel}
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
          </>
        )}
      </KeyboardAvoidingView>
      <ChoixRappel
        tache={tacheRappel}
        couleurs={couleurs}
        onFermer={() => setTacheRappel(null)}
        onChoisir={(date) => {
          if (tacheRappel) definirRappel(tacheRappel.id, date);
          setTacheRappel(null);
        }}
      />
      <AssistantIA
        visible={assistantOuvert}
        couleurs={couleurs}
        onFermer={() => setAssistantOuvert(false)}
        onAjouter={(textes) => {
          ajouterPlusieurs(textes);
          setFiltre('toutes');
        }}
      />
      {renommer && (
        <View style={styles.fondModale}>
          <View style={[styles.modale, { backgroundColor: couleurs.fond, borderColor: couleurs.bordure }]}>
            <Text style={[styles.titreModale, { color: couleurs.texte }]}>Renommer le projet</Text>
            <TextInput
              value={nomEdit}
              onChangeText={setNomEdit}
              autoFocus
              placeholder="Nom du projet"
              placeholderTextColor={couleurs.texteDoux}
              style={[styles.champ, { borderColor: couleurs.bordure, color: couleurs.texte }]}
              onSubmitEditing={validerRenommage}
            />
            <View style={styles.actionsModale}>
              <Pressable onPress={() => supprimerProjet(renommer)} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: couleurs.danger, fontWeight: '700' }}>Supprimer</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setRenommer(null)} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: couleurs.texteDoux, fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={validerRenommage} accessibilityRole="button" style={[styles.boutonModale, { backgroundColor: couleurs.accent }]}>
                <Text style={{ color: couleurs.surAccent, fontWeight: '800' }}>Renommer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  entete: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titre: { fontSize: 32, fontWeight: '800' },
  titreFlex: { flex: 1 },
  boutonIA: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999 },
  boutonIATexte: { fontSize: 15, fontWeight: '700' },
  sousTitre: { fontSize: 15, marginTop: 4 },
  projets: { paddingHorizontal: 20, paddingBottom: 10, gap: 8, flexDirection: 'row' },
  puceProjet: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  fondModale: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  modale: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 14 },
  titreModale: { fontSize: 18, fontWeight: '800' },
  actionsModale: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  boutonModale: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
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
  onglets: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 6 },
  onglet: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999, borderWidth: 1 },
  filtres: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  puce: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  chargement: { marginTop: 40 },
  liste: { paddingHorizontal: 20, paddingBottom: 24 },
  vide: { textAlign: 'center', marginTop: 40, fontSize: 15 },
  pied: { alignItems: 'center', paddingVertical: 14 },
});
