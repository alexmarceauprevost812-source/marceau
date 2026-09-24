import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Bureau } from './src/bureau/Bureau';
import { EcranCarte } from './src/ecrans/EcranCarte';
import { EcranChat } from './src/ecrans/EcranChat';
import { EcranCodex } from './src/ecrans/EcranCodex';
import { EcranAgenda } from './src/ecrans/EcranAgenda';
import { EcranPreferences } from './src/ecrans/EcranPreferences';
import { EcranReglages } from './src/ecrans/EcranReglages';
import { EcranTerminal } from './src/ecrans/EcranTerminal';
import { EcranTaches } from './src/ecrans/EcranTaches';
import type { Espace } from './src/ia/fournisseurs';
import { ReglagesIAProvider } from './src/ia/ReglagesContexte';
import { MiseAJourProvider } from './src/maj/miseAJour';
import { MenuLateral, MenuProvider, type Section } from './src/navigation/Menu';
import { Verrou } from './src/securite/Verrou';
import { useCouleurs, useModeNuit } from './src/theme';
import { Reactions } from './src/ui/Avatar';
import { Ouverture } from './src/ui/Ouverture';

type Ecran = Exclude<Section, 'agenda' | 'carte' | 'parametres' | 'preferences'>;

export default function App() {
  const couleurs = useCouleurs();
  const nuit = useModeNuit();
  const [preferencesOuvertes, setPreferencesOuvertes] = useState(false);
  const [agendaOuvert, setAgendaOuvert] = useState(false);
  const [carteOuverte, setCarteOuverte] = useState(false);
  // L'application s'ouvre toujours sur le Chat.
  const [ecran, setEcran] = useState<Ecran>('chat');
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [reglagesOuverts, setReglagesOuverts] = useState<Espace | null>(null);
  const ouvrirReglages = useCallback((espace: Espace = 'chat') => setReglagesOuverts(espace), []);
  const [bureauOuvert, setBureauOuvert] = useState(false);
  // Écran d'ouverture (2 s) au lancement de l'application.
  const [ouvert, setOuvert] = useState(false);
  // Callback mémorisé : sinon un nouveau rendu de App relancerait l'animation d'ouverture.
  const finOuverture = useCallback(() => setOuvert(true), []);
  // Le Terminal n'est chargé qu'à sa première ouverture.
  const [terminalOuvert, setTerminalOuvert] = useState(false);
  useEffect(() => {
    if (ecran === 'terminal') setTerminalOuvert(true);
  }, [ecran]);
  const ouvrirMenu = useCallback(() => setMenuOuvert(true), []);
  const ouvrirBureau = useCallback(() => setBureauOuvert(true), []);

  const choisir = (s: Section) => {
    setMenuOuvert(false);
    setBureauOuvert(false);
    // Depuis le Codex, les Paramètres s'ouvrent sur l'IA du Codex.
    if (s === 'parametres') setReglagesOuverts(ecran === 'codex' ? 'codex' : 'chat');
    else if (s === 'preferences') setPreferencesOuvertes(true);
    else if (s === 'agenda') setAgendaOuvert(true);
    else if (s === 'carte') setCarteOuverte(true);
    else setEcran(s);
  };

  return (
    <SafeAreaProvider>
      <MiseAJourProvider>
      <ReglagesIAProvider ouvrirReglages={ouvrirReglages}>
        <MenuProvider ouvrirMenu={ouvrirMenu} ouvrirBureau={ouvrirBureau}>
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
            {terminalOuvert && (
              <View style={[styles.ecran, ecran !== 'terminal' && styles.cache]}>
                <EcranTerminal couleurs={couleurs} />
              </View>
            )}
          </SafeAreaView>

          <MenuLateral
            visible={menuOuvert}
            actif={preferencesOuvertes ? 'preferences' : reglagesOuverts ? 'parametres' : ecran}
            couleurs={couleurs}
            onChoisir={choisir}
            onFermer={() => setMenuOuvert(false)}
          />
          <Bureau
            visible={bureauOuvert}
            couleurs={couleurs}
            onOuvrir={choisir}
            onFermer={() => setBureauOuvert(false)}
          />
          <EcranReglages
            visible={reglagesOuverts !== null}
            espaceInitial={reglagesOuverts ?? 'chat'}
            couleurs={couleurs}
            onFermer={() => setReglagesOuverts(null)}
          />
          <EcranPreferences
            visible={preferencesOuvertes}
            couleurs={couleurs}
            onFermer={() => setPreferencesOuvertes(false)}
          />
          <EcranAgenda visible={agendaOuvert} couleurs={couleurs} onFermer={() => setAgendaOuvert(false)} />
          <EcranCarte visible={carteOuverte} couleurs={couleurs} onFermer={() => setCarteOuverte(false)} />
          {/* Le verrou reste monté en permanence (sécurité) : il ne faut jamais laisser voir le Chat
              sans lui. L'écran d'ouverture est lui-même un Modal rendu par-dessus, donc l'animation
              s'affiche au premier plan sans démonter le verrou. */}
          <Verrou couleurs={couleurs} demarrer={ouvert} />
          <Reactions couleurs={couleurs} />
          {!ouvert && <Ouverture onFini={finOuverture} />}
          <StatusBar style={nuit ? 'light' : 'dark'} />
        </MenuProvider>
      </ReglagesIAProvider>
      </MiseAJourProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  cache: { display: 'none' },
});
