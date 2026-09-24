// SPDX-License-Identifier: MIT
import type { RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { Couleurs } from '../theme';
import type { PoigneeTerminal } from './VueTerminal';

const TOUCHES: { libelle: string; sequence: string; nom: string }[] = [
  { libelle: 'Esc', sequence: '\x1b', nom: 'Échap' },
  { libelle: 'Tab', sequence: '\t', nom: 'Tabulation' },
  { libelle: '↑', sequence: '\x1b[A', nom: 'Flèche haut' },
  { libelle: '↓', sequence: '\x1b[B', nom: 'Flèche bas' },
  { libelle: '←', sequence: '\x1b[D', nom: 'Flèche gauche' },
  { libelle: '→', sequence: '\x1b[C', nom: 'Flèche droite' },
  { libelle: '-', sequence: '-', nom: 'Tiret' },
  { libelle: '/', sequence: '/', nom: 'Barre oblique' },
  { libelle: '|', sequence: '|', nom: 'Barre verticale' },
  { libelle: '~', sequence: '~', nom: 'Tilde' },
];

type Props = {
  terminal: RefObject<PoigneeTerminal | null>;
  couleurs: Couleurs;
  ctrlActif: boolean;
  setCtrlActif: (a: boolean) => void;
};

/** Touches absentes du clavier du téléphone, comme dans Termux. */
export function BarreTouches({ terminal, couleurs: c, ctrlActif, setCtrlActif }: Props) {
  const touche = (libelle: string, onPress: () => void, actif = false, nom = libelle) => (
    <Pressable
      key={libelle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={nom}
      accessibilityState={{ selected: actif }}
      style={({ pressed }) => [
        styles.touche,
        { borderColor: c.bordure, backgroundColor: actif ? c.accent : c.carte, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.texte, { color: actif ? c.surAccent : c.texte }]}>{libelle}</Text>
    </Pressable>
  );

  return (
    <ScrollView
      horizontal
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      style={[styles.barre, { borderColor: c.bordure, backgroundColor: c.fond }]}
      contentContainerStyle={styles.contenu}
    >
      {touche('Ctrl', () => {
        const a = !ctrlActif;
        setCtrlActif(a);
        terminal.current?.ctrl(a);
      }, ctrlActif, 'Contrôle')}
      {TOUCHES.map((t) => touche(t.libelle, () => terminal.current?.touche(t.sequence), false, t.nom))}
      {touche('A−', () => terminal.current?.taillePolice(-1), false, 'Texte plus petit')}
      {touche('A+', () => terminal.current?.taillePolice(1), false, 'Texte plus grand')}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  barre: { flexGrow: 0, borderTopWidth: StyleSheet.hairlineWidth },
  contenu: { paddingHorizontal: 6, paddingVertical: 6, gap: 6 },
  touche: { minWidth: 44, height: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  texte: { fontSize: 15, fontWeight: '700', fontFamily: 'monospace' },
});
