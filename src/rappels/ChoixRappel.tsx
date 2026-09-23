import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Couleurs } from '../theme';
import type { Tache } from '../types';

/** « mar. 14 h 30 » ou « 14 h 30 » si c'est aujourd'hui. */
export function formatRappel(ms: number): string {
  const d = new Date(ms);
  const heure = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return heure;
  const demain = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + 1);
  if (d.toDateString() === demain.toDateString()) return `demain ${heure}`;
  return `${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][d.getDay()]} ${d.getDate()} · ${heure}`;
}

function choix(): { libelle: string; date: Date }[] {
  const m = new Date();
  const a = (min: number) => new Date(m.getTime() + min * 60000);
  const jour = (plus: number, h: number) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + plus, h, 0, 0);
  const liste = [
    { libelle: 'Dans 10 minutes', date: a(10) },
    { libelle: 'Dans 1 heure', date: a(60) },
    { libelle: 'Dans 3 heures', date: a(180) },
  ];
  if (m.getHours() < 17) liste.push({ libelle: 'Ce soir à 18 h', date: jour(0, 18) });
  liste.push({ libelle: 'Demain à 9 h', date: jour(1, 9) }, { libelle: 'Demain à 18 h', date: jour(1, 18) });
  const lundi = (8 - m.getDay()) % 7 || 7;
  liste.push({ libelle: 'Lundi prochain à 9 h', date: jour(lundi, 9) });
  return liste;
}

type Props = {
  tache: Tache | null;
  couleurs: Couleurs;
  onChoisir: (date: Date | null) => void;
  onFermer: () => void;
};

/** Petite fenêtre qui glisse du bas pour choisir quand être rappelé. */
export function ChoixRappel({ tache, couleurs: c, onChoisir, onFermer }: Props) {
  return (
    <Modal visible={!!tache} transparent animationType="slide" onRequestClose={onFermer}>
      <Pressable style={styles.voile} onPress={onFermer} accessibilityLabel="Fermer" />
      <View style={[styles.feuille, { backgroundColor: c.carte, borderColor: c.bordure }]}>
        <Text style={[styles.titre, { color: c.texte }]}>⏰ Me le rappeler</Text>
        <Text numberOfLines={2} style={[styles.tache, { color: c.texteDoux }]}>
          {tache?.texte}
        </Text>
        {choix().map(({ libelle, date }) => (
          <Pressable
            key={libelle}
            onPress={() => onChoisir(date)}
            style={({ pressed }) => [styles.option, { borderColor: c.bordure, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.texteOption, { color: c.texte }]}>{libelle}</Text>
            <Text style={{ color: c.texteDoux }}>{formatRappel(date.getTime())}</Text>
          </Pressable>
        ))}
        {tache?.rappel && (
          <Pressable onPress={() => onChoisir(null)} style={styles.retirer}>
            <Text style={{ color: c.danger, fontWeight: '700' }}>Retirer le rappel</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  feuille: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 36, gap: 8 },
  titre: { fontSize: 20, fontWeight: '800' },
  tache: { fontSize: 14, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  texteOption: { fontSize: 16, fontWeight: '600' },
  retirer: { alignItems: 'center', paddingTop: 10 },
});
