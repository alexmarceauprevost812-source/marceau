import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { EcranChat } from './src/ecrans/EcranChat';
import { EcranCodex } from './src/ecrans/EcranCodex';
import { EcranReglages } from './src/ecrans/EcranReglages';
import { EcranTaches } from './src/ecrans/EcranTaches';
import type { Espace } from './src/ia/fournisseurs';
import { ReglagesIAProvider } from './src/ia/ReglagesContexte';
import { MenuLateral, MenuProvider, type Section } from './src/navigation/Menu';
import { useCouleurs } from './src/theme';

type Ecran = Exclude<Section, 'parametres'>;

export default function App() {
  const couleurs = useCouleurs();
  // L'application s'ouvre toujours sur le Chat.
  const [ecran, setEcran] = useState<Ecran>('chat');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState<Espace | null>(null);
  const ouvrirReglages = useCallback((espace: Espace = 'chat') => setReglagesOuverts(espace), []);
  const ouvrirMenu = useCallback(() => setMenuOuvert(true), []);

  const choisir = (s: Section) => {
    setMenuOuvert(false);
    // Depuis le Codex, les Paramètres s'ouvrent sur l'IA du Codex.
    if (s === 'parametres') setReglagesOuverts(ecran === 'codex' ? 'codex' : 'chat');
    else setEcran(s);
  };

  return (
    <SafeAreaProvider>
      <ReglagesIAProvider ouvrirReglages={ouvrirReglages}>
        <MenuProvider ouvrirMenu={ouvrirMenu}>
          <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.ecran, { backgroundColor: couleurs.fond }]}>
            {/* Les écrans restent montés pour garder leur état (discussion en cours, etc.) */}
            <View style={[styles.ecran, ecran !== 'chat' && styles.cache]}>
              <EcranChat couleurs={couleurs} />
            </View>
            <View style={[styles.ecran, ecran !== 'codex' && styles.cache]}>
              <EcranCodex couleurs={couleurs} />
            </View>
            <View style={[styles.ecran, ecran !== 'projet' && styles.cache]}>
              <EcranTaches couleurs={couleurs} />
            </View>
          </SafeAreaView>

          <MenuLateral
            visible={menuOuvert}
            actif={reglagesOuverts ? 'parametres' : ecran}
            couleurs={couleurs}
            onChoisir={choisir}
            onFermer={() => setMenuOuvert(false)}
          />
          <EcranReglages
            visible={reglagesOuverts !== null}
            espaceInitial={reglagesOuverts ?? 'chat'}
            couleurs={couleurs}
            onFermer={() => setReglagesOuverts(null)}
          />
          <StatusBar style="auto" />
        </MenuProvider>
      </ReglagesIAProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  cache: { display: 'none' },
});
