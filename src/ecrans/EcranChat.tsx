import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import type { Couleurs } from '../theme';
import type { Conversation, Mode } from '../types';
import { Discussion } from '../ui/Discussion';
import { Entete, PuceIA } from '../ui/Entete';

const BASE =
  "Tu es l'IA intégrée à Marceau, une application québécoise. Réponds en français (québécois bienvenu) " +
  'sauf si on te parle dans une autre langue. Utilise le Markdown (titres, listes, **gras**, blocs de code).';

export const MODES: Record<Mode, { nom: string; icone: string; description: string; systeme: string; suggestions: string[] }> = {
  libre: {
    nom: 'Discussion',
    icone: '💬',
    description: 'Jaser de tout avec une IA',
    systeme: `${BASE} Sois chaleureux, clair et utile.`,
    suggestions: ['Explique-moi comment fonctionne une IA', 'Donne-moi 5 idées de soupers rapides', 'Aide-moi à planifier ma semaine'],
  },
  ecriture: {
    nom: 'Écriture',
    icone: '✍️',
    description: 'Écrire, corriger, reformuler des textes',
    systeme:
      `${BASE} Tu es un partenaire d'écriture : tu aides à rédiger, corriger (orthographe, grammaire), ` +
      'reformuler et améliorer des textes en gardant la voix de la personne. Quand tu proposes un texte, ' +
      'donne la version finale d’abord, puis tes remarques en quelques points.',
    suggestions: ['Corrige ce texte : ', 'Écris un courriel poli pour reporter un rendez-vous', 'Aide-moi à écrire une histoire courte'],
  },
  etude: {
    nom: 'Sujet',
    icone: '📚',
    description: 'Travailler un sujet en profondeur',
    systeme:
      `${BASE} Tu aides à explorer et travailler un sujet en profondeur : explique étape par étape, ` +
      'donne des exemples concrets, pose une question de vérification à la fin, et propose la prochaine étape.',
    suggestions: ['Apprends-moi les bases de Linux', "Explique-moi l'histoire du Lac-Saint-Jean", 'Aide-moi à comprendre React Native'],
  },
};

export function EcranChat({ couleurs: c }: { couleurs: Couleurs }) {
  const [conversations, setConversations] = usePersistant<Conversation[]>('marceau:conversations', []);
  const [ouverte, setOuverte] = useState<string | null>(null);

  const courante = useMemo(() => conversations.find((x) => x.id === ouverte) ?? null, [conversations, ouverte]);
  const triees = useMemo(() => [...conversations].sort((a, b) => b.majLe - a.majLe), [conversations]);

  const creer = (mode: Mode) => {
    const maintenant = Date.now();
    const conv: Conversation = { id: nouvelId(), titre: '', mode, messages: [], creeeLe: maintenant, majLe: maintenant };
    setConversations((prev) => [conv, ...prev]);
    setOuverte(conv.id);
  };

  const supprimer = (conv: Conversation) =>
    Alert.alert('Supprimer la discussion ?', conv.titre || 'Nouvelle discussion', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => setConversations((prev) => prev.filter((x) => x.id !== conv.id)),
      },
    ]);

  const retour = () => {
    // On ne garde pas les discussions vides
    setConversations((prev) => prev.filter((x) => x.messages.length > 0));
    setOuverte(null);
  };

  if (courante) {
    const mode = MODES[courante.mode];
    return (
      <View style={styles.flex}>
        <Entete
          couleurs={c}
          titre={courante.titre || mode.nom}
          sousTitre={`${mode.icone} ${mode.nom}`}
          onRetour={retour}
          droite={<PuceIA couleurs={c} />}
        />
        <Discussion
          couleurs={c}
          messages={courante.messages}
          systeme={mode.systeme}
          suggestions={mode.suggestions}
          accueil={
            <Text style={[styles.accueil, { color: c.texte }]}>
              {mode.icone} {mode.description}
            </Text>
          }
          onMessages={(messages) =>
            setConversations((prev) =>
              prev.map((x) =>
                x.id === courante.id
                  ? {
                      ...x,
                      messages,
                      majLe: Date.now(),
                      titre: x.titre || (messages[0]?.content ?? '').replace(/\s+/g, ' ').slice(0, 48),
                    }
                  : x,
              ),
            )
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Entete couleurs={c} titre="Chat" sousTitre="Jase et travaille avec des IA" droite={<PuceIA couleurs={c} />} />
      <View style={styles.modes}>
        {(Object.keys(MODES) as Mode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => creer(m)}
            accessibilityRole="button"
            accessibilityLabel={`Nouvelle discussion : ${MODES[m].nom}`}
            style={({ pressed }) => [styles.mode, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={styles.iconeMode}>{MODES[m].icone}</Text>
            <Text style={[styles.nomMode, { color: c.surAccent }]}>{MODES[m].nom}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={triees.filter((x) => x.messages.length > 0)}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.liste}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setOuverte(item.id)}
            onLongPress={() => supprimer(item)}
            style={({ pressed }) => [
              styles.ligne,
              { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={styles.iconeLigne}>{MODES[item.mode]?.icone ?? '💬'}</Text>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.titreLigne, { color: c.texte }]}>
                {item.titre || 'Discussion'}
              </Text>
              <Text numberOfLines={1} style={{ color: c.texteDoux, fontSize: 13 }}>
                {item.messages.length} messages · {new Date(item.majLe).toLocaleDateString('fr-CA')}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.vide, { color: c.texteDoux }]}>
            Choisis un mode ci-dessus pour commencer une discussion.{'\n'}Garde le doigt sur une discussion pour la supprimer.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accueil: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  mode: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 4 },
  iconeMode: { fontSize: 22 },
  nomMode: { fontSize: 14, fontWeight: '800' },
  liste: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconeLigne: { fontSize: 22 },
  titreLigne: { fontSize: 16, fontWeight: '600' },
  vide: { textAlign: 'center', marginTop: 40, fontSize: 15, lineHeight: 22 },
});
