// SPDX-License-Identifier: MIT
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ListeCommandes } from '../terminal/AideLinux';
import type { Couleurs } from '../theme';

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

/** Application « Commandes terminal » : toutes les commandes, à copier d'un toucher. */
export function EcranCommandes({ visible, couleurs: c, onFermer }: Props) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.entete, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer">
            <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Fermer</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>📖 Commandes terminal</Text>
          <View style={{ width: 60 }} />
        </View>
        <ListeCommandes couleurs={c} />
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
});
