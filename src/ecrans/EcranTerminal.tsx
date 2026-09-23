import { useCallback, useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Terminal, type InfosTerminal } from '../../modules/marceau-terminal';
import { PanneauLinux, PanneauSsh, PanneauTelephone, PanneauTermux } from '../terminal/Panneaux';
import type { Couleurs } from '../theme';
import { Entete } from '../ui/Entete';

type Onglet = 'telephone' | 'linux' | 'termux' | 'ssh';

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'linux', libelle: 'Linux' },
  { cle: 'termux', libelle: 'Termux' },
  { cle: 'ssh', libelle: 'Ordi (SSH)' },
];

const PANNEAUX = {
  telephone: PanneauTelephone,
  linux: PanneauLinux,
  termux: PanneauTermux,
  ssh: PanneauSsh,
};

/** Terminal : shell du téléphone, Linux intégré, Termux et SSH. */
export function EcranTerminal({ couleurs: c }: { couleurs: Couleurs }) {
  const [onglet, setOnglet] = useState<Onglet>('telephone');
  // Un onglet visité reste ouvert (sa session continue en arrière-plan).
  const [visites, setVisites] = useState<Onglet[]>(['telephone']);
  const [infos, setInfos] = useState<InfosTerminal | null>(() => Terminal?.infos() ?? null);

  const rafraichir = useCallback(() => setInfos(Terminal?.infos() ?? null), []);

  // Termux peut être installé pendant que Marceau est en arrière-plan.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => etat === 'active' && rafraichir());
    return () => abonnement.remove();
  }, [rafraichir]);

  const choisir = (o: Onglet) => {
    setOnglet(o);
    setVisites((v) => (v.includes(o) ? v : [...v, o]));
  };

  if (!Terminal || !infos) {
    return (
      <View style={styles.flex}>
        <Entete couleurs={c} titre="Terminal" />
        <Text style={[styles.absent, { color: c.texteDoux }]}>
          Le terminal fonctionne dans l'APK Android de Marceau (il utilise du code natif Android). Il n'est pas
          disponible sur iOS, sur le web ni dans Expo Go.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Entete couleurs={c} titre="Terminal" />
      <View style={styles.onglets} accessibilityRole="tablist">
        {ONGLETS.map(({ cle, libelle }) => {
          const actif = onglet === cle;
          return (
            <Pressable
              key={cle}
              onPress={() => choisir(cle)}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              style={({ pressed }) => [
                styles.onglet,
                { borderColor: actif ? c.accent : c.bordure, backgroundColor: actif ? c.accent : 'transparent' },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text numberOfLines={1} style={[styles.texteOnglet, { color: actif ? c.surAccent : c.texte }]}>
                {libelle}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {visites.map((o) => {
        const Panneau = PANNEAUX[o];
        return (
          <View key={o} style={[styles.flex, o !== onglet && styles.cache]}>
            <Panneau couleurs={c} infos={infos} rafraichir={rafraichir} />
          </View>
        );
      })}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cache: { display: 'none' },
  onglets: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  onglet: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  texteOnglet: { fontSize: 13, fontWeight: '700' },
  absent: { fontSize: 15, lineHeight: 22, paddingHorizontal: 20 },
});
