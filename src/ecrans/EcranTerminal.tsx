// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Terminal, type InfosTerminal } from '../../modules/marceau-terminal';
import { PanneauLinux, PanneauTelephone, PanneauTermux } from '../terminal/Panneaux';
import type { Couleurs } from '../theme';
import { Entete } from '../ui/Entete';

type Onglet = 'linux' | 'termux' | 'telephone';
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'linux', libelle: '🐧 Linux' },
  { cle: 'termux', libelle: '📦 Termux' },
  { cle: 'telephone', libelle: '📱 Téléphone' },
];

/** Terminal : Linux intégré (Kali/PRoot), Termux (app installée), et le shell du téléphone. */
export function EcranTerminal({ couleurs: c }: { couleurs: Couleurs }) {
  const [infos, setInfos] = useState<InfosTerminal | null>(() => Terminal?.infos() ?? null);
  const [onglet, setOnglet] = useState<Onglet>('linux');
  // Un onglet visité reste monté (sa session continue en arrière-plan).
  const [visites, setVisites] = useState<Set<Onglet>>(() => new Set<Onglet>(['linux']));

  const rafraichir = useCallback(() => setInfos(Terminal?.infos() ?? null), []);

  // Rafraîchir en revenant dans l'application (Termux installé, installation Linux terminée, etc.).
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => etat === 'active' && rafraichir());
    return () => abonnement.remove();
  }, [rafraichir]);

  const choisir = (cle: Onglet) => {
    setOnglet(cle);
    setVisites((v) => (v.has(cle) ? v : new Set(v).add(cle)));
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
              style={[styles.onglet, { borderColor: c.bordure }, actif && { backgroundColor: c.accent, borderColor: c.accent }]}
            >
              <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '700', fontSize: 13 }}>{libelle}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* Chaque onglet visité reste monté (caché) pour garder sa session. */}
      {visites.has('linux') && (
        <View style={[styles.flex, onglet !== 'linux' && styles.cache]}>
          <PanneauLinux couleurs={c} infos={infos} rafraichir={rafraichir} />
        </View>
      )}
      {visites.has('termux') && (
        <View style={[styles.flex, onglet !== 'termux' && styles.cache]}>
          <PanneauTermux couleurs={c} infos={infos} rafraichir={rafraichir} />
        </View>
      )}
      {visites.has('telephone') && (
        <View style={[styles.flex, onglet !== 'telephone' && styles.cache]}>
          <PanneauTelephone couleurs={c} infos={infos} rafraichir={rafraichir} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  absent: { fontSize: 15, lineHeight: 22, paddingHorizontal: 20 },
  onglets: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  onglet: { flex: 1, borderWidth: 1, borderRadius: 999, paddingVertical: 7, alignItems: 'center' },
  cache: { display: 'none' },
});
