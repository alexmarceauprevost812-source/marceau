import { createElement, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import type { Couleurs } from '../theme';

/** Adresse de la carte (application web TI-LEX-AL). */
export const URL_CARTE = 'https://ti-lex-map.vercel.app/';

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

/** Carte : affiche l'application web TI-LEX-AL en plein écran, avec la position du téléphone. */
export function EcranCarte({ visible, couleurs: c, onFermer }: Props) {
  const [cle, setCle] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);
  const web = useRef<WebView>(null);

  // Demande la permission de localisation à la première ouverture (la carte s'en sert).
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION).catch(() => {});
  }, [visible]);

  const recharger = () => {
    setErreur(false);
    setChargement(true);
    setCle((k) => k + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onFermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.barre, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Fermer</Text>
          </Pressable>
          <Text numberOfLines={1} style={[styles.titre, { color: c.texte }]}>
            🗺️ Carte
          </Text>
          <Pressable onPress={recharger} hitSlop={12} accessibilityRole="button" accessibilityLabel="Recharger la carte">
            <Text style={[styles.lien, { color: c.accentTexte }]}>↻</Text>
          </Pressable>
        </View>

        <View style={styles.flex}>
          {Platform.OS === 'web' ? (
            createElement('iframe', {
              key: cle,
              src: URL_CARTE,
              title: 'Carte',
              allow: 'geolocation',
              style: { border: 0, width: '100%', height: '100%' },
            })
          ) : (
            <WebView
              key={cle}
              ref={web}
              source={{ uri: URL_CARTE }}
              javaScriptEnabled
              domStorageEnabled
              geolocationEnabled
              originWhitelist={['*']}
              onLoadEnd={() => setChargement(false)}
              onError={() => {
                setChargement(false);
                setErreur(true);
              }}
              style={styles.flex}
            />
          )}

          {chargement && !erreur && (
            <View style={[styles.centre, { backgroundColor: c.fond }]} pointerEvents="none">
              <ActivityIndicator size="large" color={c.accentTexte} />
              <Text style={{ color: c.texteDoux, marginTop: 10 }}>Chargement de la carte…</Text>
            </View>
          )}

          {erreur && (
            <View style={[styles.centre, { backgroundColor: c.fond }]}>
              <Text style={[styles.titreErreur, { color: c.texte }]}>Carte indisponible</Text>
              <Text style={{ color: c.texteDoux, textAlign: 'center', marginHorizontal: 32, marginTop: 6 }}>
                Impossible de charger la carte. Vérifie ta connexion Internet.
              </Text>
              <Pressable
                onPress={recharger}
                accessibilityRole="button"
                style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ color: c.surAccent, fontWeight: '800' }}>Réessayer</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(URL_CARTE).catch(() => {})} hitSlop={8} style={styles.lienNav}>
                <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Ouvrir dans le navigateur ↗</Text>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titre: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  lien: { fontSize: 15, fontWeight: '700' },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 4 },
  titreErreur: { fontSize: 18, fontWeight: '800' },
  bouton: { marginTop: 18, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  lienNav: { marginTop: 14 },
});
