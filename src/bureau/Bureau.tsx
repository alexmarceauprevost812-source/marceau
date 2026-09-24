import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IMAGES } from '../images';
import { EcranLicences } from '../ecrans/EcranLicences';
import { numeroInstalle, useMiseAJour } from '../maj/miseAJour';
import type { Section } from '../navigation/Menu';
import type { Couleurs } from '../theme';
import { APPLICATIONS, type AppBureau } from './applications';

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function useHeure() {
  const [maintenant, setMaintenant] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  const hh = String(maintenant.getHours()).padStart(2, '0');
  const mm = String(maintenant.getMinutes()).padStart(2, '0');
  return {
    heure: `${hh} h ${mm}`,
    date: `${JOURS[maintenant.getDay()]} ${maintenant.getDate()} ${MOIS[maintenant.getMonth()]}`,
  };
}

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  onOuvrir: (s: Section) => void;
  onFermer: () => void;
};

/** Le Bureau : un écran comme celui d'un ordinateur, avec toutes les applications de Marceau. */
export function Bureau({ visible, couleurs: c, onOuvrir, onFermer }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [monte, setMonte] = useState(visible);
  const [licences, setLicences] = useState(false);
  const { width, height } = useWindowDimensions();
  const { heure, date } = useHeure();
  const { maj, verifier, installer } = useMiseAJour();

  useEffect(() => {
    if (visible) {
      setMonte(true);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180, mass: 0.8 }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setMonte(false),
      );
    }
  }, [visible, anim]);

  if (!monte) return null;

  const colonnes = width >= 600 ? 6 : 4;
  const largeurCase = Math.floor((Math.min(width, 900) - 32) / colonnes);

  const lancer = (app: AppBureau) => {
    if (app.ouvre === 'licences') return setLicences(true);
    if (app.ouvre !== 'mise-a-jour') return onOuvrir(app.ouvre);
    if (maj.etat === 'disponible') return installer();
    verifier(true).then(() => {});
  };

  const etatMaj =
    maj.etat === 'verification'
      ? 'Recherche de mise à jour…'
      : maj.etat === 'disponible'
        ? `Nouvelle version prête : ${maj.info.nom} — touche « Mise à jour »`
        : maj.etat === 'a-jour'
          ? 'Marceau est à jour'
          : maj.etat === 'erreur'
            ? maj.message
            : '';

  return (
    <Modal transparent visible animationType="none" onRequestClose={onFermer} statusBarTranslucent>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: c.fond,
            opacity: anim,
            transform: [
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) },
            ],
          },
        ]}
      >
        {/* Fond d'écran : deux halos orange discrets */}
        <View pointerEvents="none" style={[styles.halo, { backgroundColor: c.accent, top: -120, right: -100 }]} />
        <View pointerEvents="none" style={[styles.halo, styles.halo2, { backgroundColor: c.accent, bottom: -160, left: -140 }]} />
        {/* Fond d'écran : le M couronné, en filigrane */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.centre]}>
          <Image
            source={IMAGES.logoCouronne}
            style={{ width: Math.min(width, height) * 0.9, height: Math.min(width, height) * 0.9, opacity: 0.22 }}
            resizeMode="contain"
          />
        </View>

        <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.flex}>
          <View style={styles.barre}>
            <View style={styles.flex}>
              <Text style={[styles.heure, { color: c.texte }]}>{heure}</Text>
              <Text style={[styles.date, { color: c.texteDoux }]}>{date}</Text>
            </View>
            <Pressable
              onPress={onFermer}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer le bureau"
              style={({ pressed }) => [styles.fermer, { borderColor: c.bordure, backgroundColor: c.carte, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.x, { color: c.texte }]}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.grille}>
            {APPLICATIONS.map((app, i) => (
              <CaseApp
                key={app.id}
                app={app}
                index={i}
                anim={anim}
                largeur={largeurCase}
                couleurs={c}
                pastille={app.ouvre === 'mise-a-jour' && maj.etat === 'disponible'}
                onPress={() => lancer(app)}
              />
            ))}
          </ScrollView>

          <View style={[styles.pied, { borderColor: c.bordure, backgroundColor: c.carte }]}>
            <Image source={IMAGES.tiLexAl} style={styles.logoPied} resizeMode="contain" accessibilityLabel="TI-LEX-AL" />
            <Text numberOfLines={2} style={[styles.textePied, { color: c.texteDoux }]}>
              Marceau · build {numeroInstalle() || '—'}
              {etatMaj ? `  ·  ${etatMaj}` : ''}
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>
      <EcranLicences visible={licences} couleurs={c} onFermer={() => setLicences(false)} />
    </Modal>
  );
}

function CaseApp({
  app,
  index,
  anim,
  largeur,
  couleurs: c,
  pastille,
  onPress,
}: {
  app: AppBureau;
  index: number;
  anim: Animated.Value;
  largeur: number;
  couleurs: Couleurs;
  pastille: boolean;
  onPress: () => void;
}) {
  // Les icônes arrivent l'une après l'autre (effet cascade).
  const debut = Math.min(0.5, index * 0.06);
  const apparition = anim.interpolate({ inputRange: [debut, Math.min(1, debut + 0.5)], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <Animated.View
      style={{
        width: largeur,
        opacity: apparition,
        transform: [{ translateY: apparition.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${app.nom}`}
        style={({ pressed }) => [styles.case, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}
      >
        <View style={[styles.icone, { backgroundColor: app.couleur }]}>
          <Text style={styles.emoji}>{app.icone}</Text>
          {pastille && <View style={[styles.pastille, { backgroundColor: c.danger, borderColor: c.fond }]} />}
        </View>
        <Text numberOfLines={1} style={[styles.nom, { color: c.texte }]}>
          {app.nom}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Bouton en haut à droite (grille 2×2) qui ouvre le Bureau. */
export function IconeBureau({ couleur }: { couleur: string }) {
  return (
    <View style={styles.iconeBureau}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.carre, { borderColor: couleur }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  halo: { position: 'absolute', width: 320, height: 320, borderRadius: 160, opacity: 0.12 },
  halo2: { width: 380, height: 380, borderRadius: 190, opacity: 0.08 },
  barre: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  heure: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  date: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  fermer: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  x: { fontSize: 18, fontWeight: '800' },
  grille: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 8, rowGap: 22 },
  case: { alignItems: 'center', gap: 8 },
  icone: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  emoji: { fontSize: 30 },
  pastille: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  nom: { fontSize: 13, fontWeight: '700' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  pied: { margin: 16, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoPied: { width: 44, height: 42 },
  textePied: { flex: 1, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  iconeBureau: { width: 22, height: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  carre: { width: 9, height: 9, borderRadius: 2.5, borderWidth: 2 },
});
