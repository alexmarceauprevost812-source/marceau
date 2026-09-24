import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { attendreJeton, connexionDirectePossible, demanderCode, type CodeAppareil } from '../ia/connexionGithub';
import { utilisateurGithub } from '../ia/github';
import type { Couleurs } from '../theme';
import { POLICE_CODE } from '../ui/police';

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  onFermer: () => void;
  /** Connexion réussie : le jeton GitHub et le nom d'utilisateur. */
  onConnecte: (jeton: string, login: string) => void;
  /** Plan B : coller un jeton à la main dans les réglages. */
  onJetonManuel?: () => void;
};

/** « Se connecter avec GitHub » : un code à entrer sur github.com, et Marceau est connecté. */
export function ConnexionGithub({ visible, couleurs: c, onFermer, onConnecte, onJetonManuel }: Props) {
  const [code, setCode] = useState<CodeAppareil | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (!visible || !connexionDirectePossible()) return;
    const ctrl = new AbortController();
    setCode(null);
    setErreur(null);
    (async () => {
      try {
        const nouveau = await demanderCode();
        if (ctrl.signal.aborted) return;
        setCode(nouveau);
        const jeton = await attendreJeton(nouveau, ctrl.signal);
        const login = await utilisateurGithub(jeton);
        if (!ctrl.signal.aborted) onConnecte(jeton, login);
      } catch (e) {
        if (!ctrl.signal.aborted) setErreur((e as Error).message || 'Connexion à GitHub impossible.');
      }
    })();
    return () => ctrl.abort();
    // onConnecte change à chaque rendu du parent : on ne relance que si la fenêtre s'ouvre ou sur « Réessayer ».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, essai]);

  const ouvrirGithub = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.codeUtilisateur).catch(() => {});
    Linking.openURL(code.adresse);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onFermer} statusBarTranslucent>
      <View style={styles.fond}>
        <View style={[styles.carte, { backgroundColor: c.fond, borderColor: c.bordure }]}>
          <Text style={[styles.titre, { color: c.texte }]}>🐙 Se connecter avec GitHub</Text>

          {!connexionDirectePossible() ? (
            <Text style={[styles.texte, { color: c.texte }]}>
              La connexion directe n’est pas encore activée dans cette version de Marceau. En attendant, tu peux coller
              un jeton GitHub dans les réglages du Codex.
            </Text>
          ) : erreur ? (
            <>
              <Text style={[styles.texte, { color: c.danger }]}>⚠️ {erreur}</Text>
              <Pressable onPress={() => setEssai((n) => n + 1)} accessibilityRole="button" style={[styles.bouton, { backgroundColor: c.accent }]}>
                <Text style={{ color: c.surAccent, fontWeight: '800' }}>Réessayer</Text>
              </Pressable>
            </>
          ) : !code ? (
            <ActivityIndicator color={c.accentTexte} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <Text style={[styles.texte, { color: c.texte }]}>
                1. Touche le bouton : le code est copié et GitHub s’ouvre.{'\n'}2. Colle le code, puis touche
                « Authorize ».{'\n'}3. Reviens ici : c’est connecté tout seul.
              </Text>
              <Text selectable style={[styles.code, { color: c.texte, borderColor: c.bordure, backgroundColor: c.carte }]}>
                {code.codeUtilisateur}
              </Text>
              <Pressable onPress={ouvrirGithub} accessibilityRole="button" style={[styles.bouton, { backgroundColor: c.accent }]}>
                <Text style={{ color: c.surAccent, fontWeight: '800' }}>Copier le code et ouvrir GitHub</Text>
              </Pressable>
              <View style={styles.attente}>
                <ActivityIndicator color={c.accentTexte} />
                <Text style={{ color: c.texteDoux }}>En attente de ton accord sur GitHub…</Text>
              </View>
            </>
          )}

          <View style={styles.bas}>
            {onJetonManuel && (
              <Pressable onPress={onJetonManuel} accessibilityRole="button" hitSlop={8}>
                <Text style={{ color: c.accentTexte, fontWeight: '700' }}>Coller un jeton</Text>
              </Pressable>
            )}
            <Pressable onPress={onFermer} accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: c.texteDoux, fontWeight: '700' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  carte: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18, gap: 14 },
  titre: { fontSize: 19, fontWeight: '800' },
  texte: { fontSize: 15, lineHeight: 22 },
  code: {
    fontFamily: POLICE_CODE,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bouton: { paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  attente: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bas: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 4 },
});
