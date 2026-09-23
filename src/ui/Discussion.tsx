import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { discuter, sansReflexion, type MessageIA } from '../ia/client';
import { manqueCle } from '../ia/fournisseurs';
import { useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import { Markdown, type BlocCode } from './Markdown';

type Props = {
  couleurs: Couleurs;
  messages: MessageIA[];
  /** Appelé quand un échange est terminé (question + réponse). */
  onMessages: (messages: MessageIA[]) => void;
  systeme: string;
  placeholder?: string;
  accueil?: ReactNode;
  /** Suggestions affichées quand la discussion est vide. */
  suggestions?: string[];
  onEnregistrerFichier?: (b: BlocCode) => void;
  fichiersExistants?: string[];
  /** Action supplémentaire sous une réponse (ex. « Enregistrer tous les fichiers »). */
  actionReponse?: (texte: string) => ReactNode;
};

export function Discussion({
  couleurs: c,
  messages,
  onMessages,
  systeme,
  placeholder = 'Écris ton message…',
  accueil,
  suggestions,
  onEnregistrerFichier,
  fichiersExistants,
  actionReponse,
}: Props) {
  const { connexion, ouvrirReglages } = useReglagesIA();
  const [saisie, setSaisie] = useState('');
  const [enDirect, setEnDirect] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const controleur = useRef<AbortController | null>(null);
  const defilement = useRef<ScrollView>(null);
  const cleManquante = manqueCle(connexion);
  const occupe = question !== null;

  useEffect(() => () => controleur.current?.abort(), []);

  const envoyer = async (texte = saisie) => {
    const contenu = texte.trim();
    if (!contenu || occupe) return;
    if (cleManquante) {
      ouvrirReglages();
      return;
    }
    setSaisie('');
    setErreur('');
    setQuestion(contenu);
    setEnDirect('');
    const historique: MessageIA[] = [...messages, { role: 'user', content: contenu }];
    const ctrl = new AbortController();
    controleur.current = ctrl;
    try {
      const reponse = await discuter(connexion, {
        systeme,
        messages: historique,
        signal: ctrl.signal,
        onMorceau: (t) => setEnDirect(t),
      });
      const propre = sansReflexion(reponse).trim();
      onMessages(propre ? [...historique, { role: 'assistant', content: propre }] : historique);
      if (!propre && !ctrl.signal.aborted) setErreur("L'IA n'a rien répondu. Réessaie ou change de modèle.");
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        onMessages(historique);
      } else {
        setErreur((e as Error).message);
        setSaisie(contenu);
      }
    } finally {
      controleur.current = null;
      setQuestion(null);
      setEnDirect(null);
    }
  };

  const arreter = () => controleur.current?.abort();

  const vide = messages.length === 0 && !occupe;

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
        onContentSizeChange={() => defilement.current?.scrollToEnd({ animated: true })}
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
            action={m.role === 'assistant' ? actionReponse?.(m.content) : null}
          />
        ))}

        {question !== null && <Bulle message={{ role: 'user', content: question }} couleurs={c} />}
        {enDirect !== null &&
          (sansReflexion(enDirect) ? (
            <Bulle message={{ role: 'assistant', content: sansReflexion(enDirect) }} couleurs={c} />
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
          <Pressable onPress={ouvrirReglages}>
            <Text style={[styles.avertissement, { color: c.danger }]}>
              Ajoute une clé API dans les réglages (ou choisis Ollama) pour discuter →
            </Text>
          </Pressable>
        )}
        <View style={styles.ligneComposeur}>
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
              disabled={!saisie.trim()}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              style={({ pressed }) => [
                styles.envoyer,
                { backgroundColor: c.accent, opacity: !saisie.trim() ? 0.4 : pressed ? 0.8 : 1 },
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
  action,
}: {
  message: MessageIA;
  couleurs: Couleurs;
  onEnregistrerFichier?: (b: BlocCode) => void;
  fichiersExistants?: string[];
  action?: ReactNode;
}) {
  if (message.role === 'user') {
    return (
      <View style={[styles.bulleUtilisateur, { backgroundColor: c.carte, borderColor: c.bordure }]}>
        <Text selectable style={{ color: c.texte, fontSize: 16, lineHeight: 23 }}>
          {message.content}
        </Text>
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
  bulleUtilisateur: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bulleIA: { gap: 10 },
  reflexion: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  erreur: { borderWidth: 1, borderRadius: 12, padding: 12 },
  composeur: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 8 },
  avertissement: { fontSize: 14, fontWeight: '600' },
  ligneComposeur: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
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
