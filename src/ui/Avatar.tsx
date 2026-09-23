import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AVATARS, type Pose } from '../images';
import type { Couleurs } from '../theme';

/** Avatar rond (masque) dans la pose voulue. Petit « pop » quand la pose change. */
export function Avatar({ pose, taille = 34, couleurs: c }: { pose: Pose; taille?: number; couleurs: Couleurs }) {
  const echelle = useRef(new Animated.Value(1)).current;
  const precedente = useRef(pose);
  useEffect(() => {
    if (precedente.current === pose) return;
    precedente.current = pose;
    echelle.setValue(0.7);
    Animated.spring(echelle, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 220 }).start();
  }, [pose, echelle]);
  return (
    <Animated.View
      accessibilityRole="image"
      accessibilityLabel={NOMS[pose]}
      style={[
        styles.cadre,
        { width: taille, height: taille, borderRadius: taille / 2, borderColor: c.accent, transform: [{ scale: echelle }] },
      ]}
    >
      <Image source={AVATARS[pose]} style={{ width: '100%', height: '100%' }} />
    </Animated.View>
  );
}

const NOMS: Record<Pose, string> = { neutre: 'Avatar', pouce: 'Avatar : pouce levé', rock: 'Avatar : signe rock' };

// ---------------------------------------------------------------------------
// Réactions : l'avatar apparaît un instant pour fêter un succès.
// N'importe quel écran peut appeler reagir('rock', 'Tâche terminée !').
// ---------------------------------------------------------------------------

type Reaction = { pose: Pose; message: string; cle: number };
const ecouteurs = new Set<(r: Reaction) => void>();
let compteur = 0;

export function reagir(pose: Pose, message = '') {
  const r = { pose, message, cle: ++compteur };
  ecouteurs.forEach((f) => f(r));
}

/** À placer une fois dans l'appli : affiche les réactions en bas de l'écran. */
export function Reactions({ couleurs: c }: { couleurs: Couleurs }) {
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const f = (r: Reaction) => setReaction(r);
    ecouteurs.add(f);
    return () => {
      ecouteurs.delete(f);
    };
  }, []);

  useEffect(() => {
    if (!reaction) return;
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 200 }),
      Animated.delay(1600),
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => finished && setReaction(null));
  }, [reaction, anim]);

  if (!reaction) return null;
  return (
    <SafeAreaView pointerEvents="none" edges={['bottom']} style={styles.zone}>
      <Animated.View
        style={[
          styles.bulle,
          {
            backgroundColor: c.carte,
            borderColor: c.accent,
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}
      >
        <Avatar pose={reaction.pose} taille={56} couleurs={c} />
        {!!reaction.message && <Text style={[styles.message, { color: c.texte }]}>{reaction.message}</Text>}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cadre: { overflow: 'hidden', borderWidth: 2, backgroundColor: '#000' },
  zone: { position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center' },
  bulle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 18,
    paddingVertical: 6,
    elevation: 6,
  },
  message: { fontSize: 16, fontWeight: '800' },
});

