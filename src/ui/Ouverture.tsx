import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions, View } from 'react-native';

import { IMAGES } from '../images';

/** Combien de temps l'image reste affichée avant de passer au Chat (millisecondes). */
const DUREE = 2000;

/**
 * Écran d'ouverture : au lancement de l'application, la photo de Marceau apparaît
 * sur fond noir pendant 2 secondes, puis disparaît en fondu pour laisser le Chat.
 * Rendu par-dessus tout le reste ; s'enlève tout seul.
 */
export function Ouverture({ onFini }: { onFini: () => void }) {
  const { width, height } = useWindowDimensions();
  const opacite = useRef(new Animated.Value(0)).current; // fondu du voile noir + image
  const zoom = useRef(new Animated.Value(1.06)).current; // léger zoom arrière de l'image
  const [fini, setFini] = useState(false);

  useEffect(() => {
    // Apparition (400 ms), pause, puis disparition (450 ms).
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacite, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 1, duration: DUREE, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(DUREE - 850),
      Animated.timing(opacite, { toValue: 0, duration: 450, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setFini(true);
        onFini();
      }
    });
  }, [opacite, zoom, onFini]);

  if (fini) return null;

  const cote = Math.min(width * 0.82, height * 0.6);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.fond, { opacity: opacite }]} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale: zoom }] }}>
        <Image
          source={IMAGES.ouverture}
          style={{ width: cote, height: cote * (720 / 649) }}
          resizeMode="contain"
          accessibilityLabel="Marceau"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Fond bien noir, comme demandé.
  fond: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 1000 },
});
