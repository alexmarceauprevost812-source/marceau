import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import { annulerRappel, programmerReveil } from '../rappels/notifications';
import type { Couleurs } from '../theme';

/** Un réveil : une heure et s'il est allumé. */
type Reveil = { id: string; heure: string; actif: boolean; notifId?: string };

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

const heureValide = (h: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(h.trim());

/** Réveil : programme une sonnerie qui revient chaque jour à l'heure choisie. */
export function EcranReveil({ visible, couleurs: c, onFermer }: Props) {
  const [reveils, setReveils] = usePersistant<Reveil[]>('marceau:reveils', []);
  const [heure, setHeure] = useState('07:00');
  // Réveils dont l'activation/désactivation est en cours : évite qu'un double appui programme
  // deux notifications (dont une deviendrait « orpheline », impossible à annuler ensuite).
  const enCours = useRef<Set<string>>(new Set());

  const programmer = async (r: Reveil): Promise<string | null> => {
    const [hh, mm] = r.heure.split(':').map(Number);
    const id = await programmerReveil(hh, mm);
    if (!id) {
      Alert.alert(
        'Notifications bloquées',
        'Autorise les notifications de Marceau dans les réglages du téléphone pour que le réveil puisse sonner.',
      );
    }
    return id;
  };

  const ajouter = async () => {
    if (!heureValide(heure)) {
      Alert.alert('Heure invalide', 'Écris l’heure au format HH:MM, par exemple 07:30.');
      return;
    }
    const propre = heure.trim().padStart(5, '0');
    const nouveau: Reveil = { id: nouvelId(), heure: propre, actif: true };
    const notifId = await programmer(nouveau);
    setReveils((l) => [{ ...nouveau, actif: !!notifId, notifId: notifId ?? undefined }, ...l]);
  };

  const basculer = async (id: string) => {
    // Ignore un second appui tant que le premier n'est pas terminé (sinon double programmation).
    if (enCours.current.has(id)) return;
    const r = reveils.find((x) => x.id === id);
    if (!r) return;
    enCours.current.add(id);
    try {
      if (r.actif) {
        await annulerRappel(r.notifId);
        setReveils((l) => l.map((x) => (x.id === id ? { ...x, actif: false, notifId: undefined } : x)));
      } else {
        const notifId = await programmer(r);
        setReveils((l) => {
          // La ligne a pu être supprimée pendant la programmation : on annule alors la notification
          // qui vient d'être créée pour ne pas la laisser sonner sans contrôle.
          if (!l.some((x) => x.id === id)) {
            annulerRappel(notifId ?? undefined);
            return l;
          }
          return l.map((x) => (x.id === id ? { ...x, actif: !!notifId, notifId: notifId ?? undefined } : x));
        });
      }
    } finally {
      enCours.current.delete(id);
    }
  };

  const supprimer = (r: Reveil) => {
    annulerRappel(r.notifId);
    setReveils((l) => l.filter((x) => x.id !== r.id));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.entete}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer le réveil">
            <Text style={[styles.retour, { color: c.accentTexte }]}>‹</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>⏰ Réveil</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
          {/* Ajout d'un réveil */}
          <View style={[styles.ajout, { backgroundColor: c.carte, borderColor: c.bordure }]}>
            <Text style={[styles.label, { color: c.texte }]}>Nouvelle heure de réveil</Text>
            <View style={styles.ligne}>
              <TextInput
                value={heure}
                onChangeText={setHeure}
                placeholder="HH:MM"
                placeholderTextColor={c.texteDoux}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Heure du réveil"
                style={[styles.champHeure, { color: c.texte, borderColor: c.bordure }]}
                onSubmitEditing={ajouter}
              />
              <Pressable
                onPress={ajouter}
                accessibilityRole="button"
                style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ color: c.surAccent, fontWeight: '800' }}>Ajouter</Text>
              </Pressable>
            </View>
          </View>

          {/* Liste des réveils */}
          {reveils.length === 0 ? (
            <Text style={[styles.vide, { color: c.texteDoux }]}>Aucun réveil. Choisis une heure ci-dessus et touche « Ajouter ».</Text>
          ) : (
            reveils.map((r) => (
              <View key={r.id} style={[styles.reveil, { backgroundColor: c.carte, borderColor: c.bordure }]}>
                <Text style={[styles.reveilHeure, { color: r.actif ? c.texte : c.texteDoux }]}>{r.heure}</Text>
                <Text style={[styles.reveilInfo, { color: c.texteDoux }]}>chaque jour</Text>
                <Switch value={r.actif} onValueChange={() => basculer(r.id)} trackColor={{ true: c.accent }} accessibilityLabel="Activer le réveil" />
                <Pressable onPress={() => supprimer(r)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Supprimer le réveil">
                  <Text style={[styles.supprimer, { color: c.danger }]}>🗑️</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={[styles.note, { color: c.texteDoux }]}>
            ℹ️ Le réveil sonne grâce à une notification de Marceau. Garde les notifications autorisées et le volume ouvert. Selon ton
            téléphone, un mode « Ne pas déranger » ou l’économie de batterie peut retarder la sonnerie.
          </Text>
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
  corps: { padding: 16, gap: 12 },
  ajout: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 12 },
  label: { fontSize: 15, fontWeight: '700' },
  ligne: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  champHeure: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  bouton: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12 },
  vide: { fontSize: 15, marginTop: 4 },
  reveil: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
  reveilHeure: { fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  reveilInfo: { flex: 1, fontSize: 14 },
  supprimer: { fontSize: 18 },
  note: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
