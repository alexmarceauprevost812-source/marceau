import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTexteFluide } from '../hooks/useTexteFluide';
import { discuter, ReponseInterrompue, sansReflexion, type MessageIA } from '../ia/client';
import { FOURNISSEURS, manqueCle, type Espace } from '../ia/fournisseurs';
import { choisirFichiers, choisirImages, prendrePhoto, supprimerPieces, type PieceJointe } from '../ia/pieces';
import { useConnexion, useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import { Markdown, type BlocCode } from './Markdown';

export type Raccourci = { libelle: string; message: string };

type Props = {
  couleurs: Couleurs;
  espace: Espace;
  messages: MessageIA[];
  /** Appelé quand un échange est terminé (question + réponse). */
  onMessages: (messages: MessageIA[]) => void;
  systeme: string;
  placeholder?: string;
  accueil?: ReactNode;
  /** Suggestions affichées quand la discussion est vide. */
  suggestions?: string[];
  /** Boutons rapides toujours visibles au-dessus de la zone d'écriture. */
  raccourcis?: Raccourci[];
  onEnregistrerFichier?: (b: BlocCode) => void;
  fichiersExistants?: Record<string, string>;
  onOuvrirStudio?: (b: BlocCode) => void;
  /** Codex : ajoute une option « Importer dans le projet » au bouton +. */
  onImporterDansProjet?: (pieces: PieceJointe[]) => void;
  /** Action supplémentaire sous une réponse (ex. « Enregistrer tous les fichiers »). */
  actionReponse?: (texte: string) => ReactNode;
  maxTokens?: number;
};

type Echange = { question: MessageIA; historique: MessageIA[] };

export function Discussion({
  couleurs: c,
  espace,
  messages,
  onMessages,
  systeme,
  placeholder = 'Écris ton message…',
  accueil,
  suggestions,
  raccourcis,
  onEnregistrerFichier,
  fichiersExistants,
  onOuvrirStudio,
  onImporterDansProjet,
  actionReponse,
  maxTokens,
}: Props) {
  const { ouvrirReglages } = useReglagesIA();
  const connexion = useConnexion(espace);
  const [saisie, setSaisie] = useState('');
  const [pieces, setPieces] = useState<PieceJointe[]>([]);
  const [echange, setEchange] = useState<Echange | null>(null);
  const [recu, setRecu] = useState('');
  const [final, setFinal] = useState<MessageIA[] | null>(null);
  const [erreur, setErreur] = useState('');
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const controleur = useRef<AbortController | null>(null);
  const defilement = useRef<ScrollView>(null);
  const suivreFin = useRef(true);

  const { affiche, aJour } = useTexteFluide(sansReflexion(recu), echange !== null);
  const cleManquante = manqueCle(connexion);
  const occupe = echange !== null;

  // Si on quitte la conversation pendant une réponse, on enregistre l'échange tout de suite
  // (le composant disparaît avant que la réponse ne soit enregistrée normalement).
  const enCours = useRef({ echange, recu, final, onMessages, pieces });
  enCours.current = { echange, recu, final, onMessages, pieces };
  useEffect(
    () => () => {
      const { echange: e, recu: r, final: f, onMessages: enregistrer, pieces: nonEnvoyees } = enCours.current;
      controleur.current?.abort();
      // Photos et PDF joints mais pas envoyés : leurs copies ne serviront plus.
      supprimerPieces(nonEnvoyees);
      if (f) enregistrer(f);
      else if (e) {
        const debut = sansReflexion(r).trim();
        enregistrer(
          debut
            ? [...e.historique, { role: 'assistant', content: `${debut}\n\n_(Réponse interrompue : conversation quittée avant la fin.)_` }]
            : e.historique,
        );
      }
    },
    [],
  );

  // On descend en bas quand un message arrive (pas quand on ouvre/replie un bloc de code)
  useEffect(() => {
    suivreFin.current = true;
  }, [messages.length]);

  // Quand la réponse est complète ET entièrement affichée, on l'enregistre.
  useEffect(() => {
    if (final && aJour) terminer(final);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final, aJour]);

  const terminer = (resultat: MessageIA[]) => {
    onMessages(resultat);
    setEchange(null);
    setRecu('');
    setFinal(null);
  };

  const envoyer = async (texte = saisie) => {
    const contenu = texte.trim();
    if ((!contenu && !pieces.length) || occupe) return;
    if (cleManquante) {
      ouvrirReglages(espace);
      return;
    }
    const question: MessageIA = {
      role: 'user',
      content: contenu || (pieces.some((p) => p.type === 'image') ? 'Décris et résume cette image.' : 'Résume ce fichier.'),
      ...(pieces.length ? { pieces } : {}),
    };
    const historique = [...messages, question];
    setSaisie('');
    setPieces([]);
    setErreur('');
    setRecu('');
    setFinal(null);
    setEchange({ question, historique });
    const ctrl = new AbortController();
    controleur.current = ctrl;
    try {
      const reponse = await discuter(connexion, {
        systeme,
        messages: historique,
        signal: ctrl.signal,
        maxTokens,
        onMorceau: (t) => setRecu(t),
      });
      const propre = sansReflexion(reponse).trim();
      setRecu(reponse);
      if (!propre && !ctrl.signal.aborted) {
        setErreur("L'IA n'a rien répondu. Réessaie ou change de modèle.");
        terminer(historique);
      } else {
        setFinal(propre ? [...historique, { role: 'assistant', content: propre }] : historique);
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        terminer(historique);
      } else if (e instanceof ReponseInterrompue) {
        // On garde le début reçu, clairement marqué comme incomplet.
        const debut = sansReflexion(e.texte).trim();
        terminer(
          debut
            ? [...historique, { role: 'assistant', content: `${debut}\n\n_(Réponse interrompue : la connexion a été coupée.)_` }]
            : historique,
        );
        setErreur(e.message);
      } else {
        setErreur((e as Error).message);
        setSaisie(question.content === contenu ? contenu : '');
        setPieces(question.pieces ?? []);
        setEchange(null);
        setRecu('');
      }
    } finally {
      controleur.current = null;
    }
  };

  const arreter = () => {
    if (final) terminer(final); // réponse déjà reçue : on saute l'animation
    else controleur.current?.abort();
  };

  const joindre = async (source: () => Promise<PieceJointe[]>, versProjet = false) => {
    setAjoutEnCours(true);
    setErreur('');
    try {
      const nouvelles = await source();
      if (versProjet && onImporterDansProjet) {
        const textes = nouvelles.filter((p) => p.type === 'texte');
        if (textes.length) onImporterDansProjet(textes);
        if (textes.length < nouvelles.length) {
          // Images et PDF refusés : on efface les copies déjà faites sur le téléphone.
          supprimerPieces(nouvelles.filter((p) => p.type !== 'texte'));
          setErreur('Seuls les fichiers texte ou code vont dans le projet.');
        }
      } else {
        setPieces((prev) => {
          const toutes = [...prev, ...nouvelles];
          supprimerPieces(toutes.slice(10)); // au-delà de 10 pièces, les copies en trop sont effacées
          return toutes.slice(0, 10);
        });
      }
    } catch (e) {
      setErreur((e as Error).message || "Impossible d'ajouter ce fichier.");
    } finally {
      setAjoutEnCours(false);
    }
  };

  const menuPlus = () => {
    const options = [
      { text: '🖼️ Photo de la galerie', onPress: () => joindre(choisirImages) },
      { text: '📷 Prendre une photo', onPress: () => joindre(prendrePhoto) },
      { text: '📄 Fichier (texte, code, PDF)', onPress: () => joindre(choisirFichiers) },
      ...(onImporterDansProjet
        ? [{ text: '📁 Importer des fichiers dans le projet', onPress: () => joindre(choisirFichiers, true) }]
        : []),
      { text: 'Annuler', style: 'cancel' as const },
    ];
    if (Platform.OS === 'web') {
      joindre(choisirFichiers);
      return;
    }
    Alert.alert('Ajouter', "L'IA pourra voir, résumer et modifier ce que tu envoies.", options);
  };

  const vide = messages.length === 0 && !occupe;
  const fournisseur = FOURNISSEURS[connexion.fournisseur];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={defilement}
        style={styles.flex}
        contentContainerStyle={styles.fil}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (occupe || suivreFin.current) {
            defilement.current?.scrollToEnd({ animated: false });
            if (!occupe) suivreFin.current = false;
          }
        }}
      >
        {vide && (
          <View style={styles.accueil}>
            {accueil}
            {suggestions?.map((s) => (
              <Pressable
                key={s}
                onPress={() => envoyer(s)}
                style={({ pressed }) => [
                  styles.suggestion,
                  { borderColor: c.bordure, backgroundColor: c.carte, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text style={{ color: c.texte, fontSize: 15 }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((m, i) => (
          <Bulle
            key={i}
            message={m}
            couleurs={c}
            onEnregistrerFichier={onEnregistrerFichier}
            fichiersExistants={fichiersExistants}
            onOuvrirStudio={onOuvrirStudio}
            action={m.role === 'assistant' ? actionReponse?.(m.content) : null}
          />
        ))}

        {echange && <Bulle message={echange.question} couleurs={c} />}
        {echange &&
          (affiche ? (
            <Bulle message={{ role: 'assistant', content: affiche }} couleurs={c} />
          ) : (
            <View style={styles.reflexion}>
              <ActivityIndicator color={c.accentTexte} />
              <Text style={{ color: c.texteDoux }}>L'IA réfléchit…</Text>
            </View>
          ))}

        {!!erreur && (
          <View style={[styles.erreur, { borderColor: c.danger }]}>
            <Text style={{ color: c.danger, fontSize: 15, lineHeight: 21 }}>{erreur}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.composeur, { borderColor: c.bordure, backgroundColor: c.fond }]}>
        {cleManquante && (
          <Pressable onPress={() => ouvrirReglages(espace)}>
            <Text style={[styles.avertissement, { color: c.danger }]}>
              Ajoute ta clé {fournisseur.nom} dans les réglages pour commencer →
            </Text>
          </Pressable>
        )}

        {!!raccourcis?.length && !occupe && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raccourcis}>
            {raccourcis.map((r) => (
              <Pressable
                key={r.libelle}
                onPress={() => envoyer(r.message)}
                style={({ pressed }) => [styles.raccourci, { borderColor: c.accent, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: c.texte, fontWeight: '700', fontSize: 13 }}>{r.libelle}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {pieces.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pieces}>
            {pieces.map((p) => (
              <View key={p.id} style={[styles.piece, { backgroundColor: c.carte, borderColor: c.bordure }]}>
                {p.type === 'image' && p.uri ? (
                  <Image source={{ uri: p.uri }} style={styles.miniature} />
                ) : (
                  <Text style={styles.iconePiece}>{p.type === 'pdf' ? '📕' : '📄'}</Text>
                )}
                <Text numberOfLines={1} style={[styles.nomPiece, { color: c.texte }]}>
                  {p.nom}
                </Text>
                <Pressable
                  onPress={() => {
                    // La photo ou le PDF a déjà été copié sur le téléphone : on efface la copie.
                    supprimerPieces([p]);
                    setPieces((prev) => prev.filter((x) => x.id !== p.id));
                  }}
                  hitSlop={8}
                  accessibilityLabel={`Retirer ${p.nom}`}
                >
                  <Text style={{ color: c.danger, fontWeight: '800' }}>✕</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.ligneComposeur}>
          <Pressable
            onPress={menuPlus}
            disabled={occupe || ajoutEnCours}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une image ou un fichier"
            style={({ pressed }) => [
              styles.plus,
              { borderColor: c.accent, opacity: occupe ? 0.4 : pressed ? 0.7 : 1 },
            ]}
          >
            {ajoutEnCours ? (
              <ActivityIndicator color={c.accentTexte} />
            ) : (
              <Text style={[styles.textePlus, { color: c.accentTexte }]}>+</Text>
            )}
          </Pressable>
          <TextInput
            value={saisie}
            onChangeText={setSaisie}
            placeholder={placeholder}
            placeholderTextColor={c.texteDoux}
            multiline
            style={[styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }]}
            accessibilityLabel="Message"
          />
          {occupe ? (
            <Pressable
              onPress={arreter}
              accessibilityRole="button"
              accessibilityLabel="Arrêter la réponse"
              style={[styles.envoyer, { backgroundColor: c.accent }]}
            >
              <View style={[styles.carreStop, { backgroundColor: c.surAccent }]} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => envoyer()}
              disabled={!saisie.trim() && !pieces.length}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              style={({ pressed }) => [
                styles.envoyer,
                { backgroundColor: c.accent, opacity: !saisie.trim() && !pieces.length ? 0.4 : pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.fleche, { color: c.surAccent }]}>↑</Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bulle({
  message,
  couleurs: c,
  onEnregistrerFichier,
  fichiersExistants,
  onOuvrirStudio,
  action,
}: {
  message: MessageIA;
  couleurs: Couleurs;
  onEnregistrerFichier?: (b: BlocCode) => void;
  fichiersExistants?: Record<string, string>;
  onOuvrirStudio?: (b: BlocCode) => void;
  action?: ReactNode;
}) {
  if (message.role === 'user') {
    return (
      <View style={styles.colonneUtilisateur}>
        {!!message.pieces?.length && (
          <View style={styles.piecesEnvoyees}>
            {message.pieces.map((p) =>
              p.type === 'image' && p.uri ? (
                <Image key={p.id} source={{ uri: p.uri }} style={styles.imageEnvoyee} />
              ) : (
                <View key={p.id} style={[styles.piece, { backgroundColor: c.carte, borderColor: c.bordure }]}>
                  <Text style={styles.iconePiece}>{p.type === 'pdf' ? '📕' : '📄'}</Text>
                  <Text numberOfLines={1} style={[styles.nomPiece, { color: c.texte }]}>
                    {p.nom}
                  </Text>
                </View>
              ),
            )}
          </View>
        )}
        <View style={[styles.bulleUtilisateur, { backgroundColor: c.carte, borderColor: c.bordure }]}>
          <Text selectable style={{ color: c.texte, fontSize: 16, lineHeight: 23 }}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.bulleIA}>
      <Markdown
        texte={message.content}
        couleurs={c}
        onEnregistrerFichier={onEnregistrerFichier}
        fichiersExistants={fichiersExistants}
        onOuvrirStudio={onOuvrirStudio}
      />
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fil: { padding: 16, gap: 18, flexGrow: 1 },
  accueil: { flex: 1, justifyContent: 'center', gap: 10, paddingVertical: 24 },
  suggestion: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14 },
  colonneUtilisateur: { alignSelf: 'flex-end', maxWidth: '88%', alignItems: 'flex-end', gap: 6 },
  bulleUtilisateur: {
    borderRadius: 18,
    borderBottomRightRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  piecesEnvoyees: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  imageEnvoyee: { width: 140, height: 140, borderRadius: 12 },
  bulleIA: { gap: 10 },
  reflexion: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  erreur: { borderWidth: 1, borderRadius: 12, padding: 12 },
  composeur: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 8 },
  avertissement: { fontSize: 14, fontWeight: '600' },
  raccourcis: { gap: 8 },
  raccourci: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pieces: { gap: 8 },
  piece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 220,
  },
  miniature: { width: 36, height: 36, borderRadius: 6 },
  iconePiece: { fontSize: 20 },
  nomPiece: { flexShrink: 1, fontSize: 13 },
  ligneComposeur: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  plus: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  textePlus: { fontSize: 26, fontWeight: '700', marginTop: -2 },
  champ: {
    flex: 1,
    minHeight: 46,
    maxHeight: 160,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  envoyer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  fleche: { fontSize: 24, fontWeight: '800', marginTop: -2 },
  carreStop: { width: 14, height: 14, borderRadius: 3 },
});
