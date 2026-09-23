import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import * as Speech from 'expo-speech';

import { usePreferences } from '../preferences';
import type { Couleurs } from '../theme';

/** Enlève le Markdown pour que la voix ne lise pas les « ** » et les « # ». */
export function texteALire(md: string): string {
  return md
    .replace(/```[\s\S]*?(```|$)/g, ' (bloc de code) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_~>|]/g, '')
    .replace(/\n{2,}/g, '.\n')
    .trim();
}

/** Découpe en morceaux assez courts pour la synthèse vocale d'Android. */
function morceaux(texte: string, max = 3000): string[] {
  const sortie: string[] = [];
  let courant = '';
  for (const phrase of texte.split(/(?<=[.!?\n])\s+/)) {
    if ((courant + ' ' + phrase).length > max && courant) {
      sortie.push(courant);
      courant = '';
    }
    courant = courant ? `${courant} ${phrase}` : phrase.slice(0, max);
  }
  if (courant) sortie.push(courant);
  return sortie;
}

let arreterPrecedent: (() => void) | null = null;

/** « 🔊 Écouter » sous une réponse de l'IA : la lit à voix haute en français. */
export function BoutonEcouter({ texte, couleurs: c }: { texte: string; couleurs: Couleurs }) {
  const [parle, setParle] = useState(false);
  const { prefs } = usePreferences();

  if (Platform.OS === 'web' || !texte.trim()) return null;

  const basculer = async () => {
    if (parle) {
      await Speech.stop();
      setParle(false);
      return;
    }
    arreterPrecedent?.();
    await Speech.stop();
    const fin = () => setParle(false);
    arreterPrecedent = fin;
    const liste = morceaux(texteALire(texte));
    setParle(true);
    liste.forEach((m, i) =>
      Speech.speak(m, {
        language: 'fr-CA',
        rate: prefs.vitesseVoix,
        onDone: i === liste.length - 1 ? fin : undefined,
        onStopped: fin,
        onError: fin,
      }),
    );
  };

  return (
    <Pressable
      onPress={basculer}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={parle ? 'Arrêter la lecture' : 'Écouter la réponse'}
      style={({ pressed }) => [styles.bouton, { borderColor: c.bordure, opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.texte, { color: parle ? c.accentTexte : c.texteDoux }]}>
        {parle ? '⏹ Arrêter' : '🔊 Écouter'}
      </Text>
    </Pressable>
  );
}

/** Test de la voix depuis les Préférences. */
export function testerVoix(vitesse: number) {
  Speech.stop();
  Speech.speak('Salut ! Moi, c’est Marceau. Je peux te lire les réponses de l’IA.', { language: 'fr-CA', rate: vitesse });
}

const styles = StyleSheet.create({
  bouton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  texte: { fontSize: 13, fontWeight: '700' },
});
