import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Couleurs } from '../theme';
import { CodeColore } from './Coloration';
import { statsDiff } from './diff';
import { POLICE_CODE } from './police';
import { VueDiff } from './VueDiff';

/** Un fichier touché par l'agent : contenu avant (null = créé) et après (null = supprimé). */
export type Changement = { chemin: string; ancien: string | null; nouveau: string | null };

const nbLignes = (t: string) => (t === '' ? 0 : t.split('\n').length);

/** Lignes ajoutées / retirées d'un changement (un fichier créé = tout ajouté, supprimé = tout retiré). */
export function compterChangement(ch: Changement) {
  if (ch.ancien === null) return { ajouts: nbLignes(ch.nouveau ?? ''), retraits: 0 };
  if (ch.nouveau === null) return { ajouts: 0, retraits: nbLignes(ch.ancien) };
  return statsDiff(ch.ancien, ch.nouveau);
}

/** Total des lignes ajoutées / retirées sur plusieurs fichiers. */
export function totalChangements(liste: Changement[]) {
  return liste.reduce(
    (t, ch) => {
      const s = compterChangement(ch);
      return { ajouts: t.ajouts + s.ajouts, retraits: t.retraits + s.retraits };
    },
    { ajouts: 0, retraits: 0 },
  );
}

/** Carte d'un fichier changé : +ajouts −retraits, puis (d'un toucher) les changements ou le code en couleur. */
export function CarteChangement({ changement: ch, couleurs: c }: { changement: Changement; couleurs: Couleurs }) {
  const [ouvert, setOuvert] = useState(false);
  const cree = ch.ancien === null;
  const supprime = ch.nouveau === null;
  // Fichier modifié : on montre d'abord les changements ; fichier créé : directement le code.
  const [vue, setVue] = useState<'changements' | 'code'>(cree ? 'code' : 'changements');
  const { ajouts, retraits } = compterChangement(ch);
  const icone = cree ? '➕' : supprime ? '🗑' : '✏️';
  const etat = cree ? 'nouveau' : supprime ? 'supprimé' : 'modifié';

  return (
    <View style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
      <Pressable
        onPress={() => setOuvert((o) => !o)}
        style={styles.entete}
        accessibilityRole="button"
        accessibilityLabel={`${ch.chemin}, ${etat}, ${ajouts} lignes ajoutées, ${retraits} lignes retirées`}
      >
        <Text style={[styles.chevron, { color: c.accentTexte }]}>{ouvert ? '▾' : '▸'}</Text>
        <Text style={styles.icone}>{icone}</Text>
        <Text numberOfLines={1} style={[styles.chemin, { color: c.texte }]}>
          {ch.chemin}
        </Text>
        <Text style={[styles.compte, { color: c.code.ajout }]}>+{ajouts}</Text>
        <Text style={[styles.compte, { color: c.code.retrait }]}>−{retraits}</Text>
      </Pressable>

      {ouvert && !cree && !supprime && (
        <View style={[styles.onglets, { borderColor: c.bordure }]}>
          {(['changements', 'code'] as const).map((v) => {
            const actif = v === vue;
            return (
              <Pressable key={v} onPress={() => setVue(v)} style={[styles.onglet, actif && { borderColor: c.accent }]}>
                <Text style={{ color: actif ? c.texte : c.texteDoux, fontWeight: '700', fontSize: 12 }}>
                  {v === 'changements' ? 'Changements' : 'Code complet'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {ouvert &&
        (supprime ? (
          <Text style={[styles.info, { color: c.code.retrait }]}>Fichier supprimé ({retraits} lignes retirées).</Text>
        ) : vue === 'changements' && !cree ? (
          <VueDiff ancien={ch.ancien ?? ''} nouveau={ch.nouveau ?? ''} couleurs={c} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.code, { color: c.code.texte }]}>
              <CodeColore code={ch.nouveau ?? ''} langage="" chemin={ch.chemin} couleurs={c} />
            </Text>
          </ScrollView>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chevron: { fontSize: 14, fontWeight: '800', width: 12 },
  icone: { fontSize: 14 },
  chemin: { flex: 1, fontFamily: POLICE_CODE, fontSize: 13, fontWeight: '700' },
  compte: { fontFamily: POLICE_CODE, fontSize: 13, fontWeight: '800' },
  onglets: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  onglet: { paddingHorizontal: 10, paddingVertical: 4, borderBottomWidth: 2, borderColor: 'transparent' },
  info: { padding: 12, fontSize: 13 },
  code: { fontFamily: POLICE_CODE, fontSize: 13, lineHeight: 19, padding: 12 },
});
