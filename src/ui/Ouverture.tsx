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
  // Voile noir : opaque dès le départ (aucun flash du Chat), puis disparaît en fondu à la toute fin.
  const fond = useRef(new Animated.Value(1)).current;
  // Image : fondu d'apparition, puis reste visible (elle disparaît avec le voile).
  const image = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(1.06)).current; // léger zoom arrière sur toute la durée
  const [fini, setFini] = useState(false);

  useEffect(() => {
    // Total = DUREE (2 s). Tout tourne EN PARALLÈLE :
    // - l'image apparaît en fondu (350 ms) sur un fond déjà noir opaque (pas de flash au lancement) ;
    // - le voile noir reste opaque puis disparaît en fondu sur les 450 dernières ms (révèle le Chat) ;
    // - léger zoom arrière sur toute la durée.
    Animated.parallel([
      Animated.timing(image, { toValue: 1, duration: APPARITION, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(DUREE - DISPARITION),
        Animated.timing(fond, { toValue: 0, duration: DISPARITION, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.timing(zoom, { toValue: 1, duration: DUREE, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        setFini(true);
        onFini();
      }
    });
  }, [fond, image, zoom, onFini]);

  if (fini) return null;

  const cote = Math.min(width * 0.82, height * 0.6);

  return (
    // pointerEvents "auto" : l'overlay bloque les touches tant qu'il est affiché.
    <Animated.View style={[StyleSheet.absoluteFill, styles.fond, { opacity: fond }]}>
      <Animated.View style={{ opacity: image, transform: [{ scale: zoom }] }}>
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
