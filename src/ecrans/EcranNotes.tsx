import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import type { Couleurs } from '../theme';

/** Une note gardée sur le téléphone. */
type Note = { id: string; texte: string; majLe: number };

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

function libelleDate(ms: number): string {
  const d = new Date(ms);
  const j = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${j}/${m} à ${h}:${min}`;
}

/** Notes : de petites notes qu'on écrit et qui restent sur le téléphone. */
export function EcranNotes({ visible, couleurs: c, onFermer }: Props) {
  const [notes, setNotes] = usePersistant<Note[]>('marceau:notes', []);

  const ajouter = () => setNotes((l) => [{ id: nouvelId(), texte: '', majLe: Date.now() }, ...l]);
  const modifier = (id: string, texte: string) =>
    setNotes((l) => l.map((n) => (n.id === id ? { ...n, texte, majLe: Date.now() } : n)));
  const supprimer = (id: string) => setNotes((l) => l.filter((n) => n.id !== id));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.entete}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer les notes">
            <Text style={[styles.retour, { color: c.accentTexte }]}>‹</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>🗒️ Notes</Text>
          <Pressable onPress={ajouter} hitSlop={12} accessibilityRole="button" accessibilityLabel="Nouvelle note">
            <Text style={[styles.plus, { color: c.accentTexte }]}>＋</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {notes.length === 0 ? (
            <View style={styles.vide}>
              <Text style={[styles.videTitre, { color: c.texte }]}>Aucune note</Text>
              <Text style={[styles.videTexte, { color: c.texteDoux }]}>Touche ＋ en haut à droite pour créer une note.</Text>
              <Pressable
                onPress={ajouter}
                accessibilityRole="button"
                style={({ pressed }) => [styles.boutonVide, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ color: c.surAccent, fontWeight: '800' }}>＋ Nouvelle note</Text>
              </Pressable>
            </View>
          ) : (
            notes.map((n) => (
              <View key={n.id} style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
                <TextInput
                  value={n.texte}
                  onChangeText={(t) => modifier(n.id, t)}
                  placeholder="Écris ta note ici…"
                  placeholderTextColor={c.texteDoux}
                  multiline
                  accessibilityLabel="Note"
                  style={[styles.champ, { color: c.texte }]}
                />
                <View style={styles.pied}>
                  <Text style={[styles.date, { color: c.texteDoux }]}>Modifié le {libelleDate(n.majLe)}</Text>
                  <Pressable onPress={() => supprimer(n.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Supprimer la note">
                    <Text style={[styles.supprimer, { color: c.danger }]}>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  retour: { fontSize: 34, fontWeight: '800', lineHeight: 34 },
  titre: { fontSize: 20, fontWeight: '800' },
  plus: { fontSize: 30, fontWeight: '800', lineHeight: 32, width: 32, textAlign: 'center' },
  corps: { padding: 16, gap: 12 },
  vide: { alignItems: 'center', gap: 8, paddingTop: 60 },
  videTitre: { fontSize: 18, fontWeight: '800' },
  videTexte: { fontSize: 15, textAlign: 'center', marginHorizontal: 24 },
  boutonVide: { marginTop: 14, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  carte: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 10 },
  champ: { fontSize: 16, minHeight: 72, textAlignVertical: 'top' },
  pied: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: 12 },
  supprimer: { fontSize: 18 },
});
