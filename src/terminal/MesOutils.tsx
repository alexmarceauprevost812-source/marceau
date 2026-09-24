// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Terminal } from '../../modules/marceau-terminal';
import type { Couleurs } from '../theme';

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  onFermer: () => void;
  /** Lance l'outil dans le terminal Linux (tape son nom puis Entrée). */
  onLancer: (outil: string) => void;
};

/** Mes outils : ce que tu as installé dans le Linux avec « apk add », à lancer d'un toucher. */
export function MesOutils({ visible, couleurs: c, onFermer, onLancer }: Props) {
  const [outils, setOutils] = useState<string[]>([]);

  // Relue à chaque ouverture : un outil vient peut-être d'être installé.
  useEffect(() => {
    if (!visible) return;
    try {
      setOutils(Terminal?.outilsLinux() ?? []);
    } catch {
      setOutils([]);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.entete, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Fermer</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>🧰 Mes outils</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.corps}>
          {outils.length === 0 ? (
            <Text style={[styles.intro, { color: c.texteDoux }]}>
              Aucun outil installé pour l’instant. Dans le terminal, tape par exemple « apk add nano python3 git » :
              ils apparaîtront ici.
            </Text>
          ) : (
            <>
              <Text style={[styles.intro, { color: c.texteDoux }]}>
                {outils.length} outil{outils.length > 1 ? 's' : ''} installé{outils.length > 1 ? 's' : ''}. Touche un
                outil pour le lancer dans le terminal.
              </Text>
              {outils.map((o) => (
                <Pressable
                  key={o}
                  onPress={() => onLancer(o)}
                  accessibilityRole="button"
                  accessibilityLabel={`Lancer ${o}`}
                  style={({ pressed }) => [
                    styles.ligne,
                    { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.cmd, { color: c.accentTexte }]}>{o}</Text>
                  <Text style={[styles.lancer, { color: c.texteDoux }]}>▶</Text>
                </Pressable>
              ))}
              <Text style={[styles.pied, { color: c.texteDoux }]}>
                Si un outil ne se lance pas, son programme porte peut-être un autre nom : essaie « apk info -L {'<outil>'} ».
                Pour en retirer un : « apk del {'<outil>'} ».
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lien: { fontSize: 15, fontWeight: '700' },
  titre: { fontSize: 17, fontWeight: '800' },
  corps: { padding: 16, gap: 8 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cmd: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  lancer: { fontSize: 16, fontWeight: '800' },
  pied: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
