import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, useWindowDimensions } from 'react-native';

import { IMAGES } from '../images';

/** Durée totale de l'écran d'ouverture (millisecondes) : apparition + pause + disparition. */
const DUREE = 2000;
const APPARITION = 350;
const DISPARITION = 450;

/**
 * Écran d'ouverture : au lancement de l'application, la photo de Marceau apparaît
 * sur fond noir, reste ~2 secondes, puis disparaît en fondu pour laisser le Chat.
 * Rendu par-dessus tout le reste ; bloque les touches tant qu'il est visible et
 * s'enlève tout seul à la fin.
 */
export function Ouverture({ onFini }: { onFini: () => void }) {
  const { width, height } = useWindowDimensions();
  const opacite = useRef(new Animated.Value(0)).current; // fondu du voile noir + image
  const zoom = useRef(new Animated.Value(1.06)).current; // léger zoom arrière sur toute la durée
  const [fini, setFini] = useState(false);

  useEffect(() => {
    // Opacité : apparition (350 ms) → pause → disparition (450 ms) = DUREE au total.
    // Le zoom tourne EN PARALLÈLE sur toute la durée (il ne rallonge pas la séquence).
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacite, { toValue: 1, duration: APPARITION, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(DUREE - APPARITION - DISPARITION),
        Animated.timing(opacite, { toValue: 0, duration: DISPARITION, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(zoom, { toValue: 1, duration: DUREE, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
    // pointerEvents "auto" : l'overlay bloque les touches tant qu'il est affiché.
    <Animated.View style={[StyleSheet.absoluteFill, styles.fond, { opacity: opacite }]}>
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
