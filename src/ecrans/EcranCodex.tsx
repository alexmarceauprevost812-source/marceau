import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { FOURNISSEURS } from '../ia/fournisseurs';
import { importerDepot } from '../ia/github';
import { supprimerPieces, type PieceJointe } from '../ia/pieces';
import { useConnexion } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import type { Fichier, Projet } from '../types';
import { CodeColore } from '../ui/Coloration';
import { Discussion, type Raccourci } from '../ui/Discussion';
import { Entete, PuceIA } from '../ui/Entete';
import { blocsAvecFichier, POLICE_CODE, type BlocCode } from '../ui/Markdown';
import { assemblerHTML, pagePrincipale, Studio } from '../ui/Studio';

/** Taille du projet envoyée à l'IA (Claude accepte beaucoup plus de contexte). */
function limiteContexte(fournisseur: string) {
  return fournisseur === 'anthropic' ? 400_000 : fournisseur === 'openai' ? 200_000 : 60_000;
}

function consigneCodex(p: Projet, limite: number): string {
  const arbre = p.fichiers.map((f) => `- ${f.chemin} (${f.contenu.split('\n').length} lignes)`).join('\n');
  let contenus = '';
  let taille = 0;
  const omis: string[] = [];
  for (const f of p.fichiers) {
    const bloc = `\n### ${f.chemin}\n\`\`\`\n${f.contenu}\n\`\`\`\n`;
    if (taille + bloc.length > limite) {
      omis.push(f.chemin);
      continue;
    }
    contenus += bloc;
    taille += bloc.length;
  }
  return [
    'Tu es Codex, un ingénieur logiciel expert intégré à l’application Marceau. Tu aides une personne qui apprend',
    'à créer, comprendre, corriger et améliorer de vrais projets (sites web, applis mobiles Expo/React Native,',
    'scripts Python, etc.). Explique simplement, en français, mais code comme un professionnel.',
    '',
    'MÉTHODE :',
    '- Lis attentivement TOUS les fichiers du projet ci-dessous avant de répondre.',
    '- Pour un scan : explique ce que fait le projet, sa structure, les technologies, puis les problèmes trouvés',
    '  (bugs, sécurité, performance) classés du plus important au moins important.',
    '- Pour corriger : trouve la vraie cause, corrige-la, et n’invente pas de fichiers ou de fonctions qui n’existent pas.',
    '- Si des images ou des fichiers sont joints au message, analyse-les (capture d’écran d’erreur, maquette, etc.).',
    '',
    'RÈGLE IMPORTANTE pour chaque fichier que tu crées ou modifies : donne le fichier COMPLET dans un bloc de code',
    'dont la première ligne indique le langage PUIS le chemin exact, par exemple :',
    '```html index.html',
    '```python src/main.py',
    'Ne donne jamais un fichier partiel avec « ... le reste ne change pas ». Un bloc par fichier.',
    'Pour une page web, mets le CSS et le JavaScript dans des fichiers du projet (ou dans la page) : la personne',
    'peut voir le résultat en direct dans le Studio.',
    'Après le code, résume en quelques points ce que tu as changé et comment l’essayer.',
    '',
    `PROJET : ${p.nom}`,
    p.description ? `DESCRIPTION : ${p.description}` : '',
    p.fichiers.length ? `ARBORESCENCE (${p.fichiers.length} fichiers) :\n${arbre}` : 'Le projet ne contient encore aucun fichier.',
    contenus ? `CONTENU DES FICHIERS :${contenus}` : '',
    omis.length ? `(Fichiers trop longs pour être inclus : ${omis.join(', ')}. Demande-les si tu en as besoin.)` : '',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const RACCOURCIS: Raccourci[] = [
  {
    libelle: '🔍 Scanner le projet',
    message:
      'Scanne tout le projet : explique-moi ce qu’il fait, sa structure et les technologies utilisées, puis liste les problèmes que tu trouves (bugs, sécurité, performance), du plus important au moins important.',
  },
  {
    libelle: '🐞 Corriger les bugs',
    message: 'Trouve les bugs du projet et corrige-les. Donne les fichiers corrigés au complet.',
  },
  { libelle: '✨ Améliorer', message: 'Propose et fais les 3 améliorations les plus utiles pour ce projet.' },
  { libelle: '📖 Expliquer', message: 'Explique-moi ce projet simplement, fichier par fichier, comme à un débutant.' },
  { libelle: '📝 README', message: 'Écris ou mets à jour le fichier README.md du projet, en français.' },
];

export function EcranCodex({ couleurs: c }: { couleurs: Couleurs }) {
  const [projets, setProjets] = usePersistant<Projet[]>('marceau:projets', []);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  const courant = useMemo(() => projets.find((p) => p.id === ouvert) ?? null, [projets, ouvert]);

  const modifier = (id: string, f: (p: Projet) => Projet) =>
    setProjets((prev) => prev.map((p) => (p.id === id ? { ...f(p), majLe: Date.now() } : p)));

  const creer = (nom: string, description: string, fichiers: Fichier[] = []) => {
    const maintenant = Date.now();
    const p: Projet = {
      id: nouvelId(),
      nom: nom.trim(),
      description: description.trim(),
      fichiers,
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
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          // Les photos et PDF joints sont copiés sur le téléphone : on les efface aussi.
          supprimerPieces(p.messages.flatMap((m) => m.pieces ?? []));
          setProjets((prev) => prev.filter((x) => x.id !== p.id));
        },
      },
    ]);

  if (courant) {
    return <VueProjet projet={courant} couleurs={c} onRetour={() => setOuvert(null)} onModifier={(f) => modifier(courant.id, f)} />;
  }

  return (
    <View style={styles.flex}>
      <Entete
        couleurs={c}
        titre="Codex"
        sousTitre="Écris du code et crée des projets avec l’IA"
        droite={<PuceIA couleurs={c} espace="codex" />}
      />
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
  const [studio, setStudio] = useState<{ html: string; titre: string } | null>(null);
  const connexion = useConnexion('codex');
  const chemins = p.fichiers.map((f) => f.chemin);
  const page = pagePrincipale(p.fichiers);

  const ouvrirStudio = (b?: BlocCode) => {
    if (b) {
      // Le bloc de la réponse + les fichiers du projet (CSS, JS) qu'il utilise
      const chemin = b.chemin || 'index.html';
      setStudio({ html: assemblerHTML(b.code, chemin, p.fichiers), titre: chemin });
    } else if (page) {
      setStudio({ html: assemblerHTML(page.contenu, page.chemin, p.fichiers), titre: page.chemin });
    }
  };

  const importer = (pieces: PieceJointe[]) =>
    enregistrer(pieces.map((x) => ({ langage: '', chemin: x.nom, code: x.texte ?? '', complet: true })));

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
      <Entete
        couleurs={c}
        titre={p.nom}
        sousTitre={`Projet Codex · ${p.fichiers.length} fichier${p.fichiers.length > 1 ? 's' : ''}`}
        onRetour={onRetour}
        droite={
          <View style={styles.enteteDroite}>
            {page && (
              <Pressable
                onPress={() => ouvrirStudio()}
                accessibilityRole="button"
                accessibilityLabel="Ouvrir le Studio"
                style={({ pressed }) => [styles.boutonStudio, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 13 }}>▶ Studio</Text>
              </Pressable>
            )}
            <PuceIA couleurs={c} espace="codex" />
          </View>
        }
      />
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
          espace="codex"
          messages={p.messages}
          systeme={consigneCodex(p, limiteContexte(connexion.fournisseur))}
          maxTokens={connexion.fournisseur === 'anthropic' ? 32000 : undefined}
          raccourcis={p.fichiers.length ? RACCOURCIS : undefined}
          onOuvrirStudio={ouvrirStudio}
          onImporterDansProjet={importer}
          placeholder="Décris ce que tu veux coder…"
          onMessages={(messages) => onModifier((proj) => ({ ...proj, messages }))}
          onEnregistrerFichier={(b) => enregistrer([b])}
          fichiersExistants={chemins}
          suggestions={p.fichiers.length ? [] : [
            'Crée une page web simple avec un bouton orange',
            'Écris un script Python qui renomme des photos par date',
            'Explique-moi la structure de ce projet',
          ]}
          accueil={
            <View style={{ gap: 6, marginBottom: 6 }}>
              <Text style={[styles.accueil, { color: c.texte }]}>
                {p.fichiers.length
                  ? `Codex connaît les ${p.fichiers.length} fichiers de ce projet. Demande un scan, une correction ou une nouvelle fonction.`
                  : 'Décris ton idée : Codex écrit les fichiers, tu les enregistres dans le projet.'}
              </Text>
              <Text style={{ color: c.texteDoux, fontSize: 14 }}>
                IA : {FOURNISSEURS[connexion.fournisseur].nom} · {connexion.modele}. Le bouton + envoie des images
                (ex. une capture d’erreur) ou des fichiers.
              </Text>
            </View>
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
        onStudio={
          fichier && /\.html?$/i.test(fichier.chemin)
            ? () => {
                setFichierOuvert(null);
                setStudio({ html: assemblerHTML(fichier.contenu, fichier.chemin, p.fichiers), titre: fichier.chemin });
              }
            : undefined
        }
      />
      <Studio html={studio?.html ?? null} titre={studio?.titre ?? ''} couleurs={c} onFermer={() => setStudio(null)} />
    </View>
  );
}

function VueFichier({
  fichier,
  couleurs: c,
  onFermer,
  onSauver,
  onSupprimer,
  onStudio,
}: {
  fichier: Fichier | null;
  couleurs: Couleurs;
  onFermer: () => void;
  onSauver: (contenu: string) => void;
  onSupprimer: () => void;
  onStudio?: () => void;
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
                <Text selectable style={[styles.code, { color: c.code.texte }]}>
                  <CodeColore code={fichier.contenu} langage="" chemin={fichier.chemin} couleurs={c} />
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
            {onStudio && (
              <Pressable onPress={onStudio} style={[styles.boutonAction, { backgroundColor: c.accent }]}>
                <Text style={[styles.texteBouton, { color: c.surAccent }]}>▶ Studio</Text>
              </Pressable>
            )}
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
  onCreer: (nom: string, description: string, fichiers?: Fichier[]) => void;
}) {
  const [mode, setMode] = useState<'vide' | 'github'>('vide');
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [adresse, setAdresse] = useState('');
  const [jeton, setJeton] = useState('');
  const [progres, setProgres] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];

  const reinitialiser = () => {
    setNom('');
    setDescription('');
    setAdresse('');
    setJeton('');
    setErreur('');
    setProgres(null);
  };

  const creer = async () => {
    setErreur('');
    if (mode === 'vide') {
      if (!nom.trim()) return;
      onCreer(nom, description);
      reinitialiser();
      return;
    }
    if (!adresse.trim() || progres) return;
    setProgres('Lecture du dépôt…');
    try {
      const r = await importerDepot(adresse, jeton, (fait, total) => setProgres(`Téléchargement ${fait} / ${total} fichiers…`));
      onCreer(nom.trim() || r.nom, r.description, r.fichiers);
      reinitialiser();
    } catch (e) {
      setErreur((e as Error).message);
      setProgres(null);
    }
  };

  const pret = mode === 'vide' ? !!nom.trim() : !!adresse.trim() && !progres;

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
        <ScrollView contentContainerStyle={[styles.marges, { gap: 10 }]} keyboardShouldPersistTaps="handled">
          <View style={[styles.segments, { borderColor: c.bordure, marginHorizontal: 0 }]}>
            {(['vide', 'github'] as const).map((m) => {
              const actif = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                  style={[styles.segment, actif && { backgroundColor: c.accent }]}
                >
                  <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '700' }}>
                    {m === 'vide' ? 'Projet vide' : 'Importer de GitHub'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'github' && (
            <>
              <Text style={[styles.etiquette, { color: c.texteDoux }]}>ADRESSE DU DÉPÔT GITHUB</Text>
              <TextInput
                value={adresse}
                onChangeText={setAdresse}
                placeholder="github.com/proprio/depot"
                placeholderTextColor={c.texteDoux}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={champ}
              />
              <Text style={{ color: c.texteDoux, fontSize: 13, lineHeight: 19 }}>
                Une branche précise : github.com/proprio/depot/tree/nom-de-branche. Codex lit tous les fichiers texte et
                code (jusqu’à 200 fichiers) pour comprendre le projet.
              </Text>
              <Text style={[styles.etiquette, { color: c.texteDoux }]}>JETON GITHUB (DÉPÔT PRIVÉ, FACULTATIF)</Text>
              <TextInput
                value={jeton}
                onChangeText={setJeton}
                placeholder="ghp_…"
                placeholderTextColor={c.texteDoux}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={champ}
              />
            </>
          )}

          <Text style={[styles.etiquette, { color: c.texteDoux }]}>NOM{mode === 'github' ? ' (FACULTATIF)' : ''}</Text>
          <TextInput
            value={nom}
            onChangeText={setNom}
            placeholder={mode === 'github' ? 'Nom du dépôt par défaut' : 'Ex. : Site de ti-lex'}
            placeholderTextColor={c.texteDoux}
            style={champ}
          />
          {mode === 'vide' && (
            <>
              <Text style={[styles.etiquette, { color: c.texteDoux }]}>DESCRIPTION (FACULTATIF)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Langage, but du projet…"
                placeholderTextColor={c.texteDoux}
                multiline
                style={[...champ, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]}
              />
            </>
          )}

          {!!erreur && <Text style={{ color: c.danger, fontSize: 14, lineHeight: 20 }}>{erreur}</Text>}
          {!!progres && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={c.accentTexte} />
              <Text style={{ color: c.texte }}>{progres}</Text>
            </View>
          )}

          <Pressable
            onPress={creer}
            disabled={!pret}
            style={[styles.bouton, { backgroundColor: c.accent, opacity: pret ? 1 : 0.4, marginTop: 10 }]}
          >
            <Text style={[styles.texteBouton, { color: c.surAccent }]}>
              {mode === 'vide' ? 'Créer le projet' : 'Importer le projet'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  enteteDroite: { alignItems: 'flex-end', gap: 6 },
  boutonStudio: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
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
