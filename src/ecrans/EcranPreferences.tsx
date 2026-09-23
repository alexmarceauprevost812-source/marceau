import type { ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { modifierPreferences, usePreferences, type Preferences } from '../preferences';
import { programmerRappel } from '../rappels/notifications';
import { authentifier } from '../securite/Verrou';
import { ACCENTS, type Couleurs } from '../theme';
import { testerVoix } from '../voix/BoutonEcouter';

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

const THEMES: { cle: Preferences['theme']; libelle: string }[] = [
  { cle: 'auto', libelle: 'Auto' },
  { cle: 'jour', libelle: '☀️ Jour' },
  { cle: 'nuit', libelle: '🌙 Nuit' },
];
const VITESSES = [
  { valeur: 0.8, libelle: 'Lente' },
  { valeur: 1, libelle: 'Normale' },
  { valeur: 1.25, libelle: 'Rapide' },
];

/** Préférences : apparence, sécurité, voix et notifications. */
export function EcranPreferences({ visible, couleurs: c, onFermer }: Props) {
  const { prefs } = usePreferences();

  const changerVerrou = async (actif: boolean) => {
    // On vérifie l'empreinte avant d'activer ou de retirer le verrou.
    const ok = await authentifier(actif ? 'Activer le verrou de Marceau' : 'Retirer le verrou de Marceau').catch(() => false);
    if (ok) modifierPreferences({ verrou: actif });
    else if (actif)
      Alert.alert(
        'Verrou impossible',
        'Ajoute une empreinte, un visage ou un code de verrouillage dans les réglages du téléphone, puis réessaie.',
      );
  };

  const testerNotification = async () => {
    const id = await programmerRappel('🔔 Test Marceau', 'Les rappels fonctionnent !', new Date(Date.now() + 5000));
    Alert.alert(
      id ? 'Notification programmée' : 'Notifications bloquées',
      id
        ? 'Elle arrivera dans 5 secondes (tu peux fermer l’app pour voir).'
        : 'Autorise les notifications de Marceau dans les réglages du téléphone.',
    );
  };

  const puce = (actif: boolean, libelle: string, onPress: () => void) => (
    <Pressable
      key={libelle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      style={[styles.puce, { borderColor: c.bordure }, actif && { backgroundColor: c.accent, borderColor: c.accent }]}
    >
      <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '700' }}>{libelle}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.barre}>
          <Text style={[styles.titre, { color: c.texte }]}>Préférences</Text>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={{ color: c.accentTexte, fontSize: 17, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.contenu}>
          <Carte titre="🎨 Apparence" couleurs={c}>
            <Text style={[styles.etiquette, { color: c.texteDoux }]}>Thème</Text>
            <View style={styles.ligne}>
              {THEMES.map((t) => puce(prefs.theme === t.cle, t.libelle, () => modifierPreferences({ theme: t.cle })))}
            </View>
            <Text style={[styles.etiquette, { color: c.texteDoux }]}>Couleur des boutons</Text>
            <View style={styles.ligne}>
              {(Object.keys(ACCENTS) as Preferences['accent'][]).map((cle) => {
                const actif = prefs.accent === cle;
                return (
                  <Pressable
                    key={cle}
                    onPress={() => modifierPreferences({ accent: cle })}
                    accessibilityRole="button"
                    accessibilityLabel={ACCENTS[cle].nom}
                    accessibilityState={{ selected: actif }}
                    style={[styles.pastille, { backgroundColor: ACCENTS[cle].jour[0], borderColor: actif ? c.texte : 'transparent' }]}
                  >
                    {actif && <Text style={styles.coche}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          </Carte>

          <Carte titre="🔒 Sécurité" couleurs={c}>
            <View style={styles.ligneSwitch}>
              <View style={styles.flex}>
                <Text style={[styles.option, { color: c.texte }]}>Verrouiller avec l’empreinte</Text>
                <Text style={[styles.aide, { color: c.texteDoux }]}>
                  Empreinte, visage ou code du téléphone à l’ouverture, et après une minute hors de l’app.
                </Text>
              </View>
              <Switch
                value={prefs.verrou}
                onValueChange={changerVerrou}
                trackColor={{ true: c.accent, false: c.bordure }}
                thumbColor="#FFFFFF"
              />
            </View>
          </Carte>

          <Carte titre="🔊 Voix" couleurs={c}>
            <Text style={[styles.aide, { color: c.texteDoux }]}>
              Touche « 🔊 Écouter » sous une réponse de l’IA pour l’entendre.
            </Text>
            <Text style={[styles.etiquette, { color: c.texteDoux }]}>Vitesse de lecture</Text>
            <View style={styles.ligne}>
              {VITESSES.map((v) =>
                puce(prefs.vitesseVoix === v.valeur, v.libelle, () => modifierPreferences({ vitesseVoix: v.valeur })),
              )}
            </View>
            <Pressable onPress={() => testerVoix(prefs.vitesseVoix)} style={styles.lien}>
              <Text style={{ color: c.accentTexte, fontWeight: '700' }}>▶ Tester la voix</Text>
            </Pressable>
          </Carte>

          <Carte titre="⏰ Rappels" couleurs={c}>
            <Text style={[styles.aide, { color: c.texteDoux }]}>
              Dans Projet, touche ⏰ à côté d’une tâche pour être rappelé à l’heure choisie.
            </Text>
            <Pressable onPress={testerNotification} style={styles.lien}>
              <Text style={{ color: c.accentTexte, fontWeight: '700' }}>🔔 Tester une notification</Text>
            </Pressable>
          </Carte>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Carte({ titre, couleurs: c, children }: { titre: string; couleurs: Couleurs; children: ReactNode }) {
  return (
    <View style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
      <Text style={[styles.titreCarte, { color: c.texte }]}>{titre}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  barre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  titre: { fontSize: 28, fontWeight: '800' },
  contenu: { padding: 16, gap: 14, paddingBottom: 40 },
  carte: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 10 },
  titreCarte: { fontSize: 18, fontWeight: '800' },
  etiquette: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  ligne: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pastille: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  coche: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  ligneSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  option: { fontSize: 16, fontWeight: '700' },
  aide: { fontSize: 13, lineHeight: 18 },
  lien: { paddingVertical: 4 },
});
