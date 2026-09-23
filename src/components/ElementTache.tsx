import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Couleurs } from '../theme';
import type { Tache } from '../types';

type Props = {
  tache: Tache;
  couleurs: Couleurs;
  onBasculer: (id: string) => void;
  onSupprimer: (id: string) => void;
};

export function ElementTache({ tache, couleurs, onBasculer, onSupprimer }: Props) {
  return (
    <View style={[styles.ligne, { backgroundColor: couleurs.carte, borderColor: couleurs.bordure }]}>
      <Pressable
        onPress={() => onBasculer(tache.id)}
        style={styles.zoneTexte}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: tache.terminee }}
        accessibilityLabel={tache.texte}
      >
        <View
          style={[
            styles.case,
            { borderColor: couleurs.accent },
            tache.terminee && { backgroundColor: couleurs.accent },
          ]}
        >
          {tache.terminee && <Text style={[styles.coche, { color: couleurs.surAccent }]}>✓</Text>}
        </View>
        <Text
          style={[
            styles.texte,
            { color: tache.terminee ? couleurs.texteDoux : couleurs.texte },
            tache.terminee && styles.barre,
          ]}
        >
          {tache.texte}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onSupprimer(tache.id)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Supprimer « ${tache.texte} »`}
      >
        <Text style={[styles.supprimer, { color: couleurs.danger }]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  zoneTexte: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  case: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  coche: { fontSize: 14, fontWeight: '700' },
  texte: { flex: 1, fontSize: 16 },
  barre: { textDecorationLine: 'line-through' },
  supprimer: { fontSize: 18, paddingLeft: 12 },
});
