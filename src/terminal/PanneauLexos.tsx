// SPDX-License-Identifier: GPL-3.0-only
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { lexosBootstrapInstalle, ouvrirLexos } from '../../modules/lexos-terminal';
import type { Couleurs } from '../theme';

/** Onglet « LexOS » : ouvre le terminal LexOS (moteur Termux) qui est dans l'APK de Marceau. */
export function PanneauLexos({ couleurs: c }: { couleurs: Couleurs }) {
  const [installe, setInstalle] = useState(() => lexosBootstrapInstalle());
  const [erreur, setErreur] = useState('');

  const verifier = useCallback(() => setInstalle(lexosBootstrapInstalle()), []);

  // Au retour du terminal LexOS, savoir si l'installation du bootstrap s'est faite.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => etat === 'active' && verifier());
    return () => abonnement.remove();
  }, [verifier]);

  const ouvrir = () => {
    setErreur('');
    try {
      ouvrirLexos();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'ouvrir le terminal LexOS.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.corps}>
      <View style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
        <Text style={[styles.titre, { color: c.texte }]}>Terminal LexOS</Text>
        <Text style={{ color: c.texteDoux, lineHeight: 21 }}>
          Un vrai terminal, comme Termux, dans Marceau : shell bash, pkg, python, git, ssh, volets divisés. Il s'ouvre
          dans son propre écran ; reviens à Marceau avec le bouton retour.
        </Text>
        <Text style={{ color: installe ? c.texte : c.danger, fontWeight: '600' }}>
          {installe
            ? '✔ Le système du terminal est installé.'
            : "Le système du terminal (bash, pkg…) n'est pas encore installé. Au premier lancement, LexOS essaie de " +
              "l'installer ; si cette version de Marceau a été construite sans lui, le terminal restera vide."}
        </Text>
        <Pressable
          onPress={ouvrir}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le terminal LexOS"
          style={[styles.bouton, { backgroundColor: c.accent }]}
        >
          <Text style={{ color: c.surAccent, fontWeight: '700', fontSize: 16 }}>Ouvrir LexOS</Text>
        </Pressable>
        {!!erreur && <Text style={{ color: c.danger }}>{erreur}</Text>}
      </View>
      <Text style={{ color: c.texteDoux, lineHeight: 20 }}>
        Tes modèles IA .gguf (dossier « Models » du téléphone) pourront être utilisés depuis ce terminal. Pour en envoyer
        depuis ton ordinateur : python3 scripts/envoyer-modele.py.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  corps: { padding: 16, gap: 14 },
  carte: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  titre: { fontSize: 20, fontWeight: '800' },
  bouton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
});
