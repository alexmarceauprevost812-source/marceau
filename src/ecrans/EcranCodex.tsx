import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import { FOURNISSEURS } from '../ia/fournisseurs';
import { changementsDuProjet, importerDepot, listerDepots, type Depot } from '../ia/github';
import { supprimerPieces, type PieceJointe } from '../ia/pieces';
import { useConnexion, useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import type { Fichier, LienGithub, Projet } from '../types';
import { Discussion, type Raccourci } from '../ui/Discussion';
import { AgentCodex } from './AgentCodex';
import { Entete, PuceIA } from '../ui/Entete';
import { Explorateur } from '../ui/Explorateur';
import { blocsAvecFichier, POLICE_CODE, type BlocCode } from '../ui/Markdown';
import { assemblerHTML, pagePrincipale, Studio } from '../ui/Studio';
import { ConnexionGithub } from './ConnexionGithub';
import { EnvoiGithub } from './EnvoiGithub';

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

  const creer = (nom: string, description: string, fichiers: Fichier[] = [], github?: LienGithub) => {
    const maintenant = Date.now();
    const p: Projet = {
      id: nouvelId(),
      nom: nom.trim(),
      description: description.trim(),
      fichiers,
      messages: [],
      ...(github ? { github } : {}),
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
  // L'agent (Claude qui travaille lui-même dans le projet) est le mode principal du Codex.
  const [onglet, setOnglet] = useState<'agent' | 'discussion' | 'code'>('agent');
  const [studio, setStudio] = useState<{ html: string; titre: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [connexionGithub, setConnexionGithub] = useState(false);
  const [maj, setMaj] = useState<string | null>(null);
  const connexion = useConnexion('codex');
  const { reglages, ouvrirReglages, enregistrer: enregistrerReglages } = useReglagesIA();
  const contenus = useMemo(() => Object.fromEntries(p.fichiers.map((f) => [f.chemin, f.contenu])), [p.fichiers]);
  const changements = useMemo(() => (p.github ? changementsDuProjet(p) : []), [p]);
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

  /** Crée ou remplace des fichiers (en gardant leur version GitHub d'origine pour voir les changements). */
  const enregistrer = (blocs: { chemin: string; code: string }[]) =>
    onModifier((proj) => {
      const fichiers = [...proj.fichiers];
      for (const b of blocs) {
        const i = fichiers.findIndex((f) => f.chemin === b.chemin);
        if (i >= 0) fichiers[i] = { ...fichiers[i], contenu: b.code, majLe: Date.now() };
        else fichiers.push({ chemin: b.chemin, contenu: b.code, majLe: Date.now() });
      }
      fichiers.sort((x, y) => x.chemin.localeCompare(y.chemin));
      return { ...proj, fichiers };
    });

  const supprimer = (chemin: string) =>
    onModifier((proj) => {
      const f = proj.fichiers.find((x) => x.chemin === chemin);
      const supprimes = f?.origine !== undefined ? [...new Set([...(proj.supprimes ?? []), chemin])] : proj.supprimes;
      return { ...proj, supprimes, fichiers: proj.fichiers.filter((x) => x.chemin !== chemin) };
    });

  const importer = (pieces: PieceJointe[]) => enregistrer(pieces.map((x) => ({ chemin: x.nom, code: x.texte ?? '' })));

  const exporter = () => {
    const texte = p.fichiers.map((f) => `===== ${f.chemin} =====\n${f.contenu}`).join('\n\n');
    Share.share({ title: p.nom, message: texte || '(projet vide)' }).catch(() => {});
  };

  const mettreAJour = () => {
    if (!p.github) return;
    const lancer = async () => {
      setMaj('Téléchargement depuis GitHub…');
      try {
        const { proprio, depot, branche } = p.github!;
        const r = await importerDepot(`github.com/${proprio}/${depot}/tree/${branche}`, reglages.jetonGithub, (fait, total) =>
          setMaj(`Téléchargement ${fait} / ${total} fichiers…`),
        );
        onModifier((proj) => ({ ...proj, fichiers: r.fichiers, github: r.lien, supprimes: [] }));
        setMaj(null);
      } catch (e) {
        setMaj(null);
        Alert.alert('Mise à jour impossible', (e as Error).message);
      }
    };
    if (changements.length) {
      Alert.alert(
        'Remplacer tes changements ?',
        `Tu as ${changements.length} changement(s) pas encore envoyé(s). La version de GitHub va les remplacer.`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Remplacer', style: 'destructive', onPress: lancer },
        ],
      );
    } else lancer();
  };

  return (
    <View style={styles.flex}>
      <Entete
        couleurs={c}
        titre={p.nom}
        sousTitre={p.github ? `⎇ ${p.github.proprio}/${p.github.depot} · ${p.github.branche}` : `Projet local · ${p.fichiers.length} fichier${p.fichiers.length > 1 ? 's' : ''}`}
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

      {/* Barre GitHub */}
      <View style={[styles.barreGithub, { borderColor: c.bordure, backgroundColor: c.carte }]}>
        <Text style={[styles.texteGithub, { color: c.texte }]} numberOfLines={1}>
          {maj ?? (p.github ? (changements.length ? `${changements.length} changement${changements.length > 1 ? 's' : ''} à envoyer` : 'À jour avec GitHub ✓') : 'Pas encore sur GitHub')}
        </Text>
        {maj ? (
          <ActivityIndicator color={c.accentTexte} />
        ) : (
          <View style={styles.actionsGithub}>
            {p.github && (
              <Pressable onPress={mettreAJour} hitSlop={6} accessibilityLabel="Mettre à jour depuis GitHub" style={[styles.boutonGithub, { borderColor: c.bordure }]}>
                <Text style={{ color: c.texte, fontWeight: '700', fontSize: 13 }}>⬇ Tirer</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => (reglages.jetonGithub.trim() ? setEnvoi(true) : setConnexionGithub(true))}
              accessibilityLabel={p.github ? 'Envoyer sur GitHub' : 'Publier sur GitHub'}
              style={[styles.boutonGithub, { backgroundColor: c.accent, borderColor: c.accent }]}
            >
              <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 13 }}>
                {p.github ? `⬆ Pousser${changements.length ? ` (${changements.length})` : ''}` : '⬆ Publier'}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.segments, { borderColor: c.bordure }]}>
        {(['agent', 'discussion', 'code'] as const).map((o) => {
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
                {o === 'discussion' ? '💬 Discussion' : o === 'agent' ? '🤖 Agent Claude' : `</> Code (${p.fichiers.length})`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.flex, onglet !== 'discussion' && styles.cache]}>
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
          onEnregistrerFichier={(b) => enregistrer([{ chemin: b.chemin, code: b.code }])}
          fichiersExistants={contenus}
          suggestions={
            p.fichiers.length
              ? []
              : [
                  'Crée une page web simple avec un bouton orange',
                  'Écris un script Python qui renomme des photos par date',
                  'Crée une petite appli de notes en HTML, CSS et JavaScript',
                ]
          }
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
                onPress={() => enregistrer(blocs.map((b) => ({ chemin: b.chemin, code: b.code })))}
                style={({ pressed }) => [styles.boutonSecondaire, { borderColor: c.accent, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Enregistrer les {blocs.length} fichiers</Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* L'agent reste monté pendant qu'il travaille, même si on change d'onglet */}
      <View style={[styles.flex, onglet !== 'agent' && styles.cache]}>
        <AgentCodex projet={p} couleurs={c} onModifier={onModifier} />
      </View>

      {onglet === 'code' && (
        <View style={styles.flex}>
          <Explorateur
            fichiers={p.fichiers}
            couleurs={c}
            changements={changements}
            onSauver={(chemin, contenu) => enregistrer([{ chemin, code: contenu }])}
            onSupprimer={supprimer}
            onStudio={(f) => setStudio({ html: assemblerHTML(f.contenu, f.chemin, p.fichiers), titre: f.chemin })}
            onNouveau={(chemin) => {
              if (!contenus[chemin]) enregistrer([{ chemin, code: '' }]);
            }}
          />
          {p.fichiers.length > 0 && (
            <Pressable onPress={exporter} style={[styles.lienExporter, { borderColor: c.bordure }]}>
              <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Partager tout le projet (texte) →</Text>
            </Pressable>
          )}
        </View>
      )}

      <EnvoiGithub
        projet={envoi ? p : null}
        couleurs={c}
        onFermer={() => setEnvoi(false)}
        onSynchronise={(nouveau) => onModifier(() => nouveau)}
      />
      <ConnexionGithub
        visible={connexionGithub}
        couleurs={c}
        onFermer={() => setConnexionGithub(false)}
        onConnecte={async (jeton) => {
          await enregistrerReglages({ ...reglages, jetonGithub: jeton });
          setConnexionGithub(false);
          setEnvoi(true);
        }}
        onJetonManuel={() => {
          setConnexionGithub(false);
          ouvrirReglages('codex');
        }}
      />
      <Studio html={studio?.html ?? null} titre={studio?.titre ?? ''} couleurs={c} onFermer={() => setStudio(null)} />
    </View>
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
  onCreer: (nom: string, description: string, fichiers?: Fichier[], github?: LienGithub) => void;
}) {
  const { reglages, ouvrirReglages, enregistrer } = useReglagesIA();
  const jeton = reglages.jetonGithub;
  const [mode, setMode] = useState<'vide' | 'github'>('vide');
  const [connexionGithub, setConnexionGithub] = useState(false);
  const [depots, setDepots] = useState<Depot[] | null>(null);
  const [chargementDepots, setChargementDepots] = useState(false);
  const [filtre, setFiltre] = useState('');
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [adresse, setAdresse] = useState('');
  const [progres, setProgres] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];

  const reinitialiser = () => {
    setNom('');
    setDescription('');
    setAdresse('');
    setFiltre('');
    setErreur('');
    setProgres(null);
  };

  // Chaque import a un numéro : si on ferme la fenêtre pendant l'import, son résultat est ignoré.
  const importEnCours = useRef(0);
  const fermer = () => {
    importEnCours.current++;
    reinitialiser();
    onFermer();
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
    const numero = ++importEnCours.current;
    const toujoursDemande = () => numero === importEnCours.current;
    try {
      const r = await importerDepot(adresse, jeton, (fait, total) => {
        if (toujoursDemande()) setProgres(`Téléchargement ${fait} / ${total} fichiers…`);
      });
      if (!toujoursDemande()) return; // import annulé
      onCreer(nom.trim() || r.nom, r.description, r.fichiers, r.lien);
      reinitialiser();
    } catch (e) {
      if (!toujoursDemande()) return;
      setErreur((e as Error).message);
      setProgres(null);
    }
  };

  const pret = mode === 'vide' ? !!nom.trim() : !!adresse.trim() && !progres;

  const chargerDepots = async () => {
    if (!jeton.trim() || chargementDepots) return;
    setChargementDepots(true);
    setErreur('');
    try {
      setDepots(await listerDepots(jeton));
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setChargementDepots(false);
    }
  };

  const depotsFiltres = (depots ?? []).filter((d) => d.nomComplet.toLowerCase().includes(filtre.trim().toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={fermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.barre}>
          <Pressable onPress={fermer} hitSlop={12}>
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
              {jeton.trim() ? (
                <>
                  <View style={styles.ligneMesDepots}>
                    <Text style={[styles.etiquette, { color: c.texteDoux }]}>MES DÉPÔTS</Text>
                    <Pressable onPress={chargerDepots} hitSlop={8}>
                      <Text style={{ color: c.accentTexte, fontWeight: '700' }}>
                        {depots ? '↻ Actualiser' : 'Afficher mes dépôts'}
                      </Text>
                    </Pressable>
                  </View>
                  {chargementDepots && <ActivityIndicator color={c.accentTexte} />}
                  {depots && (
                    <>
                      <TextInput
                        value={filtre}
                        onChangeText={setFiltre}
                        placeholder="Chercher un dépôt…"
                        placeholderTextColor={c.texteDoux}
                        autoCapitalize="none"
                        style={champ}
                      />
                      <View style={[styles.listeDepots, { borderColor: c.bordure, backgroundColor: c.carte }]}>
                        {depotsFiltres.slice(0, 30).map((d) => {
                          const choisi = adresse === `github.com/${d.nomComplet}`;
                          return (
                            <Pressable
                              key={d.nomComplet}
                              onPress={() => setAdresse(`github.com/${d.nomComplet}`)}
                              style={[styles.ligneDepot, choisi && { backgroundColor: c.fond }]}
                            >
                              <Text style={{ fontSize: 15 }}>{d.prive ? '🔒' : '📦'}</Text>
                              <View style={styles.flex}>
                                <Text numberOfLines={1} style={{ color: c.texte, fontWeight: choisi ? '800' : '600', fontFamily: POLICE_CODE, fontSize: 14 }}>
                                  {d.nomComplet}
                                </Text>
                                {!!d.description && (
                                  <Text numberOfLines={1} style={{ color: c.texteDoux, fontSize: 12 }}>
                                    {d.description}
                                  </Text>
                                )}
                              </View>
                              {choisi && <Text style={{ color: c.accentTexte, fontWeight: '900' }}>✓</Text>}
                            </Pressable>
                          );
                        })}
                        {!depotsFiltres.length && (
                          <Text style={{ color: c.texteDoux, padding: 12 }}>Aucun dépôt trouvé.</Text>
                        )}
                      </View>
                    </>
                  )}
                </>
              ) : (
                <Pressable
                  onPress={() => setConnexionGithub(true)}
                  style={[styles.boutonSecondaire, { borderColor: c.accent, alignSelf: 'stretch' }]}
                >
                  <Text style={{ color: c.accentTexte, fontWeight: '700', lineHeight: 20 }}>
                    🐙 Se connecter avec GitHub pour voir tes dépôts, même privés, et envoyer tes changements →
                  </Text>
                </Pressable>
              )}
              <ConnexionGithub
                visible={connexionGithub}
                couleurs={c}
                onFermer={() => setConnexionGithub(false)}
                onConnecte={async (nouveau) => {
                  await enregistrer({ ...reglages, jetonGithub: nouveau });
                  setConnexionGithub(false);
                }}
                onJetonManuel={() => {
                  setConnexionGithub(false);
                  fermer();
                  ouvrirReglages('codex');
                }}
              />

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
                code (jusqu’à 300 fichiers) pour comprendre le projet au complet.
              </Text>
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
  cache: { display: 'none' },
  ligneMesDepots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listeDepots: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  ligneDepot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  barreGithub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  texteGithub: { flex: 1, fontSize: 13, fontWeight: '700' },
  actionsGithub: { flexDirection: 'row', gap: 6 },
  boutonGithub: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
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
  lienExporter: { paddingVertical: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
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
