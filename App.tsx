import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { EcranChat } from './src/ecrans/EcranChat';
import { EcranCodex } from './src/ecrans/EcranCodex';
import { EcranReglages } from './src/ecrans/EcranReglages';
import { EcranTaches } from './src/ecrans/EcranTaches';
import type { Espace } from './src/ia/fournisseurs';
import { ReglagesIAProvider } from './src/ia/ReglagesContexte';
import { useCouleurs } from './src/theme';

type Onglet = 'taches' | 'chat' | 'codex';

const ONGLETS: { cle: Onglet; icone: string; libelle: string }[] = [
  { cle: 'taches', icone: '✓', libelle: 'Tâches' },
  { cle: 'chat', icone: '💬', libelle: 'Chat' },
  { cle: 'codex', icone: '</>', libelle: 'Codex' },
];

export default function App() {
  const couleurs = useCouleurs();
  const [onglet, setOnglet] = useState<Onglet>('taches');
  const [reglagesOuverts, setReglagesOuverts] = useState<Espace | null>(null);
  const ouvrirReglages = useCallback((espace: Espace = 'chat') => setReglagesOuverts(espace), []);

  return (
    <SafeAreaProvider>
      <ReglagesIAProvider ouvrirReglages={ouvrirReglages}>
        <SafeAreaView edges={['top', 'left', 'right']} style={[styles.ecran, { backgroundColor: couleurs.fond }]}>
          {/* Les écrans restent montés pour garder leur état (discussion en cours, etc.) */}
          <View style={[styles.ecran, onglet !== 'taches' && styles.cache]}>
            <EcranTaches couleurs={couleurs} />
          </View>
          <View style={[styles.ecran, onglet !== 'chat' && styles.cache]}>
            <EcranChat couleurs={couleurs} />
          </View>
          <View style={[styles.ecran, onglet !== 'codex' && styles.cache]}>
            <EcranCodex couleurs={couleurs} />
          </View>
        </SafeAreaView>

        <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: couleurs.carte }}>
          <View style={[styles.barre, { borderColor: couleurs.bordure }]} accessibilityRole="tablist">
            {ONGLETS.map(({ cle, icone, libelle }) => {
              const actif = onglet === cle;
              return (
                <Pressable
                  key={cle}
                  onPress={() => setOnglet(cle)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                  accessibilityLabel={libelle}
                  style={styles.onglet}
                >
                  <View style={[styles.pastille, actif && { backgroundColor: couleurs.accent }]}>
                    <Text style={[styles.icone, { color: actif ? couleurs.surAccent : couleurs.texteDoux }]}>{icone}</Text>
                  </View>
                  <Text style={[styles.libelle, { color: actif ? couleurs.texte : couleurs.texteDoux }]}>{libelle}</Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>

        <EcranReglages
          visible={reglagesOuverts !== null}
          espaceInitial={reglagesOuverts ?? 'chat'}
          couleurs={couleurs}
          onFermer={() => setReglagesOuverts(null)}
        />
        <StatusBar style="auto" />
      </ReglagesIAProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  cache: { display: 'none' },
  barre: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, paddingBottom: 4 },
  onglet: { flex: 1, alignItems: 'center', gap: 2 },
  pastille: { minWidth: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  icone: { fontSize: 16, fontWeight: '800' },
  libelle: { fontSize: 12, fontWeight: '700' },
});
