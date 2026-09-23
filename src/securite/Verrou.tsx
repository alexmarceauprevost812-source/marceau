import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { modifierPreferences, usePreferences } from '../preferences';
import type { Couleurs } from '../theme';

/** Temps passé hors de l'app avant de la reverrouiller (choisir une photo ne doit pas la verrouiller). */
const DELAI_MS = 60_000;

/** Vérifie que le téléphone a une empreinte, un visage ou un code, puis demande de s'identifier. */
export async function authentifier(raison: string): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const materiel = await LocalAuthentication.hasHardwareAsync();
  const inscrit = await LocalAuthentication.isEnrolledAsync();
  if (!materiel || !inscrit) {
    // Pas d'empreinte : on accepte le code/schéma du téléphone s'il existe.
    const niveau = await LocalAuthentication.getEnrolledLevelAsync();
    if (niveau === LocalAuthentication.SecurityLevel.NONE) return false;
  }
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: raison,
    cancelLabel: 'Annuler',
    disableDeviceFallback: false,
  });
  return r.success;
}

/** true si le téléphone n'a plus ni empreinte, ni visage, ni code de verrouillage. */
async function telephoneSansSecurite(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE;
}

/** Écran de verrouillage par empreinte / visage / code, par-dessus toute l'application. */
export function Verrou({ couleurs: c }: { couleurs: Couleurs }) {
  const { prefs, pret } = usePreferences();
  const [verrouille, setVerrouille] = useState(true);
  const [erreur, setErreur] = useState('');
  const quitteLe = useRef<number | null>(null);
  const enCours = useRef(false);

  const deverrouiller = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    setErreur('');
    try {
      // Porte de sortie : si le téléphone n'a plus aucune sécurité, le verrou ne pourrait jamais
      // être levé. On le désactive (retirer le code du téléphone demande déjà de le connaître).
      if (await telephoneSansSecurite()) {
        modifierPreferences({ verrou: false });
        setVerrouille(false);
        Alert.alert(
          'Verrou désactivé',
          'Ton téléphone n’a plus d’empreinte, de visage ni de code de verrouillage : le verrou de Marceau a été désactivé. ' +
            'Ajoute une sécurité au téléphone puis réactive-le dans Préférences.',
        );
        return;
      }
      if (await authentifier('Déverrouiller Marceau')) setVerrouille(false);
      else setErreur('Identification annulée ou refusée.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      enCours.current = false;
    }
  }, []);

  // Au démarrage : demander l'empreinte si le verrou est activé.
  useEffect(() => {
    if (!pret) return;
    if (prefs.verrou) deverrouiller();
    else setVerrouille(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);

  // Reverrouiller quand on revient après plus d'une minute ailleurs.
  useEffect(() => {
    const abo = AppState.addEventListener('change', (etat) => {
      if (etat === 'background') quitteLe.current = Date.now();
      if (etat === 'active' && quitteLe.current && prefs.verrou && !enCours.current) {
        if (Date.now() - quitteLe.current > DELAI_MS) {
          setVerrouille(true);
          deverrouiller();
        }
        quitteLe.current = null;
      }
    });
    return () => abo.remove();
  }, [prefs.verrou, deverrouiller]);

  if (pret && (!prefs.verrou || !verrouille)) return null;

  // Un Modal passe par-dessus tout, y compris le Bureau et les réglages déjà ouverts.
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
    <View style={[styles.ecran, { backgroundColor: c.fond }]}>
      {pret && (
        <>
          <Text style={styles.cadenas}>🔒</Text>
          <Text style={[styles.titre, { color: c.texte }]}>Marceau est verrouillé</Text>
          {!!erreur && <Text style={[styles.erreur, { color: c.danger }]}>{erreur}</Text>}
          <Pressable
            onPress={deverrouiller}
            accessibilityRole="button"
            style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.texteBouton, { color: c.surAccent }]}>Déverrouiller</Text>
          </Pressable>
        </>
      )}
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  cadenas: { fontSize: 64 },
  titre: { fontSize: 22, fontWeight: '800' },
  erreur: { fontSize: 14, textAlign: 'center' },
  bouton: { borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14, marginTop: 8 },
  texteBouton: { fontSize: 17, fontWeight: '800' },
});
