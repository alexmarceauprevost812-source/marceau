import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Couleurs } from '../theme';
import { avecContexte, diffLignes } from './diff';
import { POLICE_CODE } from './police';

/** Affiche les changements d'un fichier : lignes ajoutées (+) et retirées (−), comme « git diff ». */
export function VueDiff({ ancien, nouveau, couleurs: c }: { ancien: string; nouveau: string; couleurs: Couleurs }) {
  const lignes = avecContexte(diffLignes(ancien, nouveau));
  if (!lignes.length) {
    return <Text style={[styles.vide, { color: c.texteDoux }]}>Aucun changement.</Text>;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.pile}>
        {lignes.map((l, i) => {
          if (l.type === 'saut') {
            return (
              <Text key={i} style={[styles.ligne, styles.saut, { color: c.texteDoux }]}>
                {l.texte}
              </Text>
            );
          }
          const couleur = l.type === 'ajout' ? c.code.ajout : l.type === 'retrait' ? c.code.retrait : c.texteDoux;
          const signe = l.type === 'ajout' ? '+' : l.type === 'retrait' ? '−' : ' ';
          return (
            <Text
              key={i}
              selectable
              style={[
                styles.ligne,
                { color: couleur },
                l.type !== 'egal' && { backgroundColor: couleur + '22', fontWeight: '600' },
              ]}
            >
              {signe} {l.texte || ' '}
            </Text>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pile: { paddingVertical: 8, minWidth: '100%' },
  ligne: { fontFamily: POLICE_CODE, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 12 },
  saut: { fontStyle: 'italic', paddingVertical: 2 },
  vide: { padding: 12, fontSize: 13 },
});
