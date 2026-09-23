import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import type { Couleurs } from '../theme';
import type { Fichier, Projet } from '../types';
import { Discussion } from '../ui/Discussion';
import { Entete, PuceIA } from '../ui/Entete';
import { blocsAvecFichier, POLICE_CODE, type BlocCode } from '../ui/Markdown';

const LIMITE_CONTEXTE = 40_000;

function consigneCodex(p: Projet): string {
  let fichiers = '';
  let taille = 0;
  for (const f of p.fichiers) {
    const bloc = `\n### ${f.chemin}\n\`\`\`\n${f.contenu}\n\`\`\`\n`;
    if (taille + bloc.length > LIMITE_CONTEXTE) {
      fichiers += `\n(${f.chemin} : trop long pour être inclus)`;
      continue;
    }
    fichiers += bloc;
    taille += bloc.length;
  }
  return [
    'Tu es Codex, un assistant de programmation intégré à l’application Marceau. Tu aides à créer de vrais projets',
    '(sites web, applis, scripts Python, etc.) pour une personne qui apprend : explique simplement, en français.',
    '',
    'RÈGLE IMPORTANTE pour chaque fichier que tu crées ou modifies : donne le fichier COMPLET dans un bloc de code',
    'dont la première ligne indique le langage PUIS le chemin, par exemple :',
    '```html index.html',
    '```python src/main.py',
    'Ne donne jamais un fichier partiel avec « ... le reste ne change pas ». Un bloc par fichier.',
    'Après le code, explique en quelques points ce que tu as fait et comment l’essayer.',
    '',
    `PROJET : ${p.nom}`,
    p.description ? `DESCRIPTION : ${p.description}` : '',
    p.fichiers.length ? `FICHIERS ACTUELS DU PROJET :${fichiers}` : 'Le projet ne contient encore aucun fichier.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function EcranCodex({ couleurs: c }: { couleurs: Couleurs }) {
  const [projets, setProjets] = usePersistant<Projet[]>('marceau:projets', []);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const courant = useMemo(() => projets.find((p) => p.id === ouvert) ?? null, [projets, ouvert]);

  const modifier = (id: string, f: (p: Projet) => Projet) =>
    setProjets((prev) => prev.map((p) => (p.id === id ? { ...f(p), majLe: Date.now() } : p)));

  const creer = (nom: string, description: string) => {
    const maintenant = Date.now();
    const p: Projet = {
      id: nouvelId(),
      nom: nom.trim(),
      description: description.trim(),
      fichiers: [],
      messages: [],
      creeLe: maintenant,
      majLe: maintenant,
    };
    setProjets((prev) => [p, ...prev]);
    setCreation(false);
    setOuvert(p.id);
  };

  const supprimer = (p: Projet) =>
    Alert.alert('Supprimer le projet ?', `« ${p.nom} » et ses ${p.fichiers.length} fichiers seront effacés.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setProjets((prev) => prev.filter((x) => x.id !== p.id)) },
    ]);

  if (courant) {
    return <VueProjet projet={courant} couleurs={c} onRetour={() => setOuvert(null)} onModifier={(f) => modifier(courant.id, f)} />;
  }

  return (
    <View style={styles.flex}>
      <Entete couleurs={c} titre="Codex" sousTitre="Écris du code et crée des projets avec l’IA" droite={<PuceIA couleurs={c} />} />
      <View style={styles.marges}>
        <Pressable
          onPress={() => setCreation(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.texteBouton, { color: c.surAccent }]}>+ Nouveau projet</Text>
        </Pressable>
      </View>
      <FlatList
        data={[...projets].sort((a, b) => b.majLe - a.majLe)}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.liste}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setOuvert(item.id)}
            onLongPress={() => supprimer(item)}
            style={({ pressed }) => [styles.ligne, { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.icone, { color: c.accentTexte }]}>{'</>'}</Text>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.titreLigne, { color: c.texte }]}>
                {item.nom}
              </Text>
              <Text numberOfLines={1} style={{ color: c.texteDoux, fontSize: 13 }}>
                {item.fichiers.length} fichier{item.fichiers.length > 1 ? 's' : ''}
                {item.description ? ` · ${item.description}` : ''}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.vide, { color: c.texteDoux }]}>
            Crée un projet, décris ce que tu veux construire, et Codex écrit le code avec toi.{'\n'}
            Garde le doigt sur un projet pour le supprimer.
          </Text>
        }
      />
      <NouveauProjet visible={creation} couleurs={c} onFermer={() => setCreation(false)} onCreer={creer} />
    </View>
  );
}

function VueProjet({
  projet: p,
  couleurs: c,
  onRetour,
  onModifier,
}: {
  projet: Projet;
  couleurs: Couleurs;
  onRetour: () => void;
  onModifier: (f: (p: Projet) => Projet) => void;
}) {
  const [onglet, setOnglet] = useState<'discussion' | 'fichiers'>('discussion');
  const [fichierOuvert, setFichierOuvert] = useState<string | null>(null);
  const chemins = p.fichiers.map((f) => f.chemin);

  const enregistrer = (blocs: BlocCode[]) =>
    onModifier((proj) => {
      const fichiers = [...proj.fichiers];
      for (const b of blocs) {
        const i = fichiers.findIndex((f) => f.chemin === b.chemin);
        const nouveau: Fichier = { chemin: b.chemin, contenu: b.code, majLe: Date.now() };
        if (i >= 0) fichiers[i] = nouveau;
        else fichiers.push(nouveau);
      }
      fichiers.sort((a, b) => a.chemin.localeCompare(b.chemin));
      return { ...proj, fichiers };
    });

  const exporter = () => {
    const texte = p.fichiers.map((f) => `===== ${f.chemin} =====\n${f.contenu}`).join('\n\n');
    Share.share({ title: p.nom, message: texte || '(projet vide)' }).catch(() => {});
  };

  const fichier = p.fichiers.find((f) => f.chemin === fichierOuvert) ?? null;

  return (
    <View style={styles.flex}>
      <Entete couleurs={c} titre={p.nom} sousTitre="Projet Codex" onRetour={onRetour} droite={<PuceIA couleurs={c} />} />
      <View style={[styles.segments, { borderColor: c.bordure }]}>
        {(['discussion', 'fichiers'] as const).map((o) => {
          const actif = onglet === o;
          return (
            <Pressable
              key={o}
              onPress={() => setOnglet(o)}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              style={[styles.segment, actif && { backgroundColor: c.accent }]}
            >
              <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '700' }}>
                {o === 'discussion' ? 'Discussion' : `Fichiers (${p.fichiers.length})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {onglet === 'discussion' ? (
        <Discussion
          couleurs={c}
          messages={p.messages}
          systeme={consigneCodex(p)}
          placeholder="Décris ce que tu veux coder…"
          onMessages={(messages) => onModifier((proj) => ({ ...proj, messages }))}
          onEnregistrerFichier={(b) => enregistrer([b])}
          fichiersExistants={chemins}
          suggestions={[
            'Crée une page web simple avec un bouton orange',
            'Écris un script Python qui renomme des photos par date',
            'Explique-moi la structure de ce projet',
          ]}
          accueil={
            <Text style={[styles.accueil, { color: c.texte }]}>
              Décris ton idée : Codex écrit les fichiers, tu les enregistres dans le projet.
            </Text>
          }
          actionReponse={(texte) => {
            const blocs = blocsAvecFichier(texte);
            if (blocs.length < 2) return null;
            return (
              <Pressable
                onPress={() => enregistrer(blocs)}
                style={({ pressed }) => [styles.boutonSecondaire, { borderColor: c.accent, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Enregistrer les {blocs.length} fichiers</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={p.fichiers}
          keyExtractor={(f) => f.chemin}
          contentContainerStyle={styles.liste}
          ListHeaderComponent={
            p.fichiers.length ? (
              <Pressable onPress={exporter} style={styles.lienExporter}>
                <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Partager tout le projet →</Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setFichierOuvert(item.chemin)}
              style={({ pressed }) => [styles.ligne, { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.8 : 1 }]}
            >
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.chemin, { color: c.texte }]}>
                  {item.chemin}
                </Text>
                <Text style={{ color: c.texteDoux, fontSize: 13 }}>
                  {item.contenu.split('\n').length} ligne{item.contenu.split('\n').length > 1 ? 's' : ''} · {new Date(item.majLe).toLocaleString('fr-CA')}
                </Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={[styles.vide, { color: c.texteDoux }]}>
              Aucun fichier. Dans la discussion, touche « Enregistrer » sur un bloc de code.
            </Text>
          }
        />
      )}

      <VueFichier
        fichier={fichier}
        couleurs={c}
        onFermer={() => setFichierOuvert(null)}
        onSauver={(contenu) =>
          onModifier((proj) => ({
            ...proj,
            fichiers: proj.fichiers.map((f) => (f.chemin === fichierOuvert ? { ...f, contenu, majLe: Date.now() } : f)),
          }))
        }
        onSupprimer={() => {
          onModifier((proj) => ({ ...proj, fichiers: proj.fichiers.filter((f) => f.chemin !== fichierOuvert) }));
          setFichierOuvert(null);
        }}
      />
    </View>
  );
}

function VueFichier({
  fichier,
  couleurs: c,
  onFermer,
  onSauver,
  onSupprimer,
}: {
  fichier: Fichier | null;
  couleurs: Couleurs;
  onFermer: () => void;
  onSauver: (contenu: string) => void;
  onSupprimer: () => void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const fermer = () => {
    setEdition(null);
    onFermer();
  };

  if (!fichier) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={fermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.barre}>
            <Pressable onPress={fermer} hitSlop={12}>
              <Text style={[styles.lien, { color: c.accentTexte }]}>Fermer</Text>
            </Pressable>
            <Text numberOfLines={1} style={[styles.titreBarre, { color: c.texte, fontFamily: POLICE_CODE }]}>
              {fichier.chemin}
            </Text>
            <Pressable
              hitSlop={12}
              onPress={() => {
                if (edition === null) setEdition(fichier.contenu);
                else {
                  onSauver(edition);
                  setEdition(null);
                }
              }}
            >
              <Text style={[styles.lien, { color: c.accentTexte }]}>{edition === null ? 'Modifier' : 'Enregistrer'}</Text>
            </Pressable>
          </View>

          {edition === null ? (
            <ScrollView style={styles.flex} contentContainerStyle={styles.marges}>
              <ScrollView horizontal>
                <Text selectable style={[styles.code, { color: c.texte }]}>
                  {fichier.contenu}
                </Text>
              </ScrollView>
            </ScrollView>
          ) : (
            <TextInput
              value={edition}
              onChangeText={setEdition}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={[styles.code, styles.editeur, { color: c.texte, backgroundColor: c.carte, borderColor: c.bordure }]}
            />
          )}

          <View style={[styles.actions, { borderColor: c.bordure }]}>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(fichier.contenu);
                setCopie(true);
                setTimeout(() => setCopie(false), 1500);
              }}
              style={[styles.boutonAction, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.texteBouton, { color: c.surAccent }]}>{copie ? 'Copié ✓' : 'Copier'}</Text>
            </Pressable>
            <Pressable
              onPress={() => Share.share({ title: fichier.chemin, message: fichier.contenu }).catch(() => {})}
              style={[styles.boutonAction, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.texteBouton, { color: c.surAccent }]}>Partager</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                Alert.alert('Supprimer ce fichier ?', fichier.chemin, [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: onSupprimer },
                ])
              }
              style={[styles.boutonAction, { borderColor: c.danger, borderWidth: 1 }]}
            >
              <Text style={[styles.texteBouton, { color: c.danger }]}>Supprimer</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function NouveauProjet({
  visible,
  couleurs: c,
  onFermer,
  onCreer,
}: {
  visible: boolean;
  couleurs: Couleurs;
  onFermer: () => void;
  onCreer: (nom: string, description: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];

  const creer = () => {
    if (!nom.trim()) return;
    onCreer(nom, description);
    setNom('');
    setDescription('');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.barre}>
          <Pressable onPress={onFermer} hitSlop={12}>
            <Text style={[styles.lien, { color: c.accentTexte }]}>Annuler</Text>
          </Pressable>
          <Text style={[styles.titreBarre, { color: c.texte }]}>Nouveau projet</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={[styles.marges, { gap: 10 }]}>
          <Text style={[styles.etiquette, { color: c.texteDoux }]}>NOM</Text>
          <TextInput
            value={nom}
            onChangeText={setNom}
            placeholder="Ex. : Site de ti-lex"
            placeholderTextColor={c.texteDoux}
            style={champ}
            autoFocus
          />
          <Text style={[styles.etiquette, { color: c.texteDoux }]}>DESCRIPTION (FACULTATIF)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Langage, but du projet…"
            placeholderTextColor={c.texteDoux}
            multiline
            style={[...champ, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]}
          />
          <Pressable
            onPress={creer}
            disabled={!nom.trim()}
            style={[styles.bouton, { backgroundColor: c.accent, opacity: nom.trim() ? 1 : 0.4, marginTop: 10 }]}
          >
            <Text style={[styles.texteBouton, { color: c.surAccent }]}>Créer le projet</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  marges: { paddingHorizontal: 20, paddingBottom: 14 },
  accueil: { fontSize: 18, fontWeight: '700', lineHeight: 25, marginBottom: 6 },
  bouton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  texteBouton: { fontSize: 15, fontWeight: '700' },
  boutonSecondaire: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  liste: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icone: { fontFamily: POLICE_CODE, fontSize: 16, fontWeight: '700' },
  titreLigne: { fontSize: 16, fontWeight: '600' },
  chemin: { fontFamily: POLICE_CODE, fontSize: 15 },
  vide: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22 },
  segments: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderRadius: 999, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
  lienExporter: { paddingVertical: 6 },
  barre: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  titreBarre: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  lien: { fontSize: 15, fontWeight: '600' },
  code: { fontFamily: POLICE_CODE, fontSize: 13, lineHeight: 19 },
  editeur: { flex: 1, marginHorizontal: 12, padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  boutonAction: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  etiquette: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 6 },
  champ: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
});
