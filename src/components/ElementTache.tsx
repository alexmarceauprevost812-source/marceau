import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRappel } from '../rappels/ChoixRappel';
import type { Couleurs } from '../theme';
import type { Tache } from '../types';

type Props = {
  tache: Tache;
  couleurs: Couleurs;
  onBasculer: (id: string) => void;
  onSupprimer: (id: string) => void;
  onRappel: (tache: Tache) => void;
};

export function ElementTache({ tache, couleurs, onBasculer, onSupprimer, onRappel }: Props) {
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
            { borderColor: couleurs.accentTexte },
            tache.terminee && { backgroundColor: couleurs.accent, borderColor: couleurs.accent },
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
      {!tache.terminee && (
        <Pressable
          onPress={() => onRappel(tache)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tache.rappel ? `Rappel ${formatRappel(tache.rappel.date)}` : 'Ajouter un rappel'}
          style={[
            styles.rappel,
            tache.rappel ? { backgroundColor: couleurs.accent } : { borderColor: couleurs.bordure, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.texteRappel, { color: tache.rappel ? couleurs.surAccent : couleurs.texteDoux }]}>
            ⏰{tache.rappel ? ` ${formatRappel(tache.rappel.date)}` : ''}
          </Text>
        </Pressable>
      )}
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
  rappel: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8, maxWidth: 140 },
  texteRappel: { fontSize: 12, fontWeight: '700' },
});
