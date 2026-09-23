import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Couleurs } from '../theme';

export type Section = 'chat' | 'codex' | 'projet' | 'parametres';

export const SECTIONS: { cle: Section; icone: string; libelle: string }[] = [
  { cle: 'chat', icone: '💬', libelle: 'Chat' },
  { cle: 'codex', icone: '</>', libelle: 'Codex' },
  { cle: 'projet', icone: '📁', libelle: 'Projet' },
  { cle: 'parametres', icone: '⚙️', libelle: 'Paramètres' },
];

const MenuCtx = createContext<{ ouvrirMenu: () => void } | null>(null);

export const MenuProvider = ({ ouvrirMenu, children }: { ouvrirMenu: () => void; children: ReactNode }) => (
  <MenuCtx.Provider value={{ ouvrirMenu }}>{children}</MenuCtx.Provider>
);

/** Bouton ☰ qui ouvre le menu de gauche (à mettre dans les en-têtes). */
export function BoutonMenu({ couleurs: c }: { couleurs: Couleurs }) {
  const menu = useContext(MenuCtx);
  if (!menu) return null;
  return (
    <Pressable
      onPress={menu.ouvrirMenu}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Ouvrir le menu"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={[styles.hamburger, { color: c.texte }]}>☰</Text>
    </Pressable>
  );
}

type Props = {
  visible: boolean;
  actif: Section;
  couleurs: Couleurs;
  onChoisir: (s: Section) => void;
  onFermer: () => void;
};

/** Menu qui glisse depuis la gauche de l'écran. */
export function MenuLateral({ visible, actif, couleurs: c, onChoisir, onFermer }: Props) {
  const { width } = useWindowDimensions();
  const largeur = Math.min(300, width * 0.8);
  const anim = useRef(new Animated.Value(0)).current;
  const [monte, setMonte] = useState(visible);

  useEffect(() => {
    if (visible) setMonte(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMonte(false);
    });
  }, [visible, anim]);

  if (!monte) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onFermer} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.voile, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFermer} accessibilityLabel="Fermer le menu" />
      </Animated.View>
      <Animated.View
        style={[
          styles.panneau,
          {
            width: largeur,
            backgroundColor: c.carte,
            borderColor: c.bordure,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-largeur, 0] }) }],
          },
        ]}
      >
        <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.flex}>
          <Text style={[styles.titre, { color: c.texte }]}>Marceau</Text>
          <View style={styles.liste} accessibilityRole="menu">
            {SECTIONS.map(({ cle, icone, libelle }) => {
              const choisi = actif === cle;
              return (
                <Pressable
                  key={cle}
                  onPress={() => onChoisir(cle)}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: choisi }}
                  style={({ pressed }) => [
                    styles.element,
                    choisi && { backgroundColor: c.accent },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.icone, { color: choisi ? c.surAccent : c.texte }]}>{icone}</Text>
                  <Text style={[styles.libelle, { color: choisi ? c.surAccent : c.texte }]}>{libelle}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hamburger: { fontSize: 26, fontWeight: '700', lineHeight: 30 },
  voile: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panneau: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRightWidth: StyleSheet.hairlineWidth },
  titre: { fontSize: 28, fontWeight: '800', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  liste: { paddingHorizontal: 12, gap: 6 },
  element: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14 },
  icone: { fontSize: 18, fontWeight: '800', width: 32, textAlign: 'center' },
  libelle: { fontSize: 17, fontWeight: '700' },
});
