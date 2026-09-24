import { memo, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { DirectAgent } from '../ia/agentCodex';
import type { Couleurs } from '../theme';
import { CodeColore } from './Coloration';
import { POLICE_CODE } from './police';

/** Lignes de code gardées à l'écran pendant l'écriture (les dernières) : l'affichage reste fluide. */
const LIGNES_VISIBLES = 40;

/** Curseur qui clignote au bout de ce que Claude écrit. */
// (Texte imbriqué dans un autre Text : pas d'Animated possible, on alterne la couleur.)
function Curseur({ couleur }: { couleur: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setVisible((v) => !v), 500);
    return () => clearInterval(t);
  }, []);
  return <Text style={{ color: visible ? couleur : 'transparent', fontWeight: '800' }}>▍</Text>;
}

/** Ce que Claude écrit en ce moment : sa réponse, ou le code d'un fichier en couleur, ligne par ligne. */
export const EcritureDirecte = memo(function EcritureDirecte({ direct: d, couleurs: c }: { direct: DirectAgent; couleurs: Couleurs }) {
  if (d.type === 'texte') {
    return (
      <Text style={{ color: c.texte, fontSize: 15, lineHeight: 22 }}>
        {d.texte}
        <Curseur couleur={c.accentTexte} />
      </Text>
    );
  }
  const lignes = d.code.split('\n');
  const debut = Math.max(0, lignes.length - LIGNES_VISIBLES);
  const visible = lignes.slice(debut).join('\n');
  return (
    <View style={[styles.carte, { borderColor: c.bordure }]}>
      <View style={styles.entete}>
        <Text style={styles.icone}>{d.type === 'ecrire' ? '✍️' : '✏️'}</Text>
        <Text numberOfLines={1} style={[styles.chemin, { color: c.texte }]}>
          {d.chemin || '…'}
        </Text>
        <Text style={[styles.compte, { color: c.code.ajout }]}>+{lignes.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={[styles.code, { color: c.code.texte }]}>
          {debut > 0 && <Text style={{ color: c.texteDoux }}>{`… ${debut} lignes plus haut\n`}</Text>}
          <CodeColore code={visible} langage="" chemin={d.chemin} couleurs={c} />
          <Curseur couleur={c.accentTexte} />
        </Text>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  carte: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  icone: { fontSize: 14 },
  chemin: { flex: 1, fontFamily: POLICE_CODE, fontSize: 13, fontWeight: '700' },
  compte: { fontFamily: POLICE_CODE, fontSize: 13, fontWeight: '800' },
  code: { fontFamily: POLICE_CODE, fontSize: 13, lineHeight: 19, paddingHorizontal: 12, paddingBottom: 12 },
});
