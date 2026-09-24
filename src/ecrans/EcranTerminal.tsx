// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import { AppState, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Terminal, type InfosTerminal } from '../../modules/marceau-terminal';
import { PanneauLinux } from '../terminal/Panneaux';
import type { Couleurs } from '../theme';
import { Entete } from '../ui/Entete';

/** Terminal : un seul terminal, le Linux intégré (PRoot). */
export function EcranTerminal({ couleurs: c }: { couleurs: Couleurs }) {
  const [infos, setInfos] = useState<InfosTerminal | null>(() => Terminal?.infos() ?? null);

  const rafraichir = useCallback(() => setInfos(Terminal?.infos() ?? null), []);

  // Rafraîchir en revenant dans l'application (installation terminée, etc.).
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => etat === 'active' && rafraichir());
    return () => abonnement.remove();
  }, [rafraichir]);

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
      <PanneauLinux couleurs={c} infos={infos} rafraichir={rafraichir} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  absent: { fontSize: 15, lineHeight: 22, paddingHorizontal: 20 },
});
