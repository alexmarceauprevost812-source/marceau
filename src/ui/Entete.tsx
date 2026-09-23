import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FOURNISSEURS, type Espace } from '../ia/fournisseurs';
import { useConnexion, useReglagesIA } from '../ia/ReglagesContexte';
import { BoutonBureau, BoutonMenu } from '../navigation/Menu';
import type { Couleurs } from '../theme';

type Props = {
  couleurs: Couleurs;
  titre: string;
  sousTitre?: string;
  onRetour?: () => void;
  droite?: ReactNode;
};

/** En-tête d'écran : bouton menu ☰ (ou retour) et puce de l'IA active. */
export function Entete({ couleurs: c, titre, sousTitre, onRetour, droite }: Props) {
  return (
    <View style={styles.entete}>
      <View style={styles.ligne}>
        {!onRetour && <BoutonMenu couleurs={c} />}
        {onRetour && (
          <Pressable onPress={onRetour} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retour">
            <Text style={[styles.retour, { color: c.accentTexte }]}>‹</Text>
          </Pressable>
        )}
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[onRetour ? styles.titreSecondaire : styles.titre, { color: c.texte }]}>
            {titre}
          </Text>
          {!!sousTitre && (
            <Text numberOfLines={1} style={[styles.sousTitre, { color: c.texteDoux }]}>
              {sousTitre}
            </Text>
          )}
        </View>
        {droite}
        <BoutonBureau couleurs={c} />
      </View>
    </View>
  );
}

/** Puce qui montre l'IA et le modèle actifs ; ouvre les réglages. */
export function PuceIA({ couleurs: c, espace = 'chat' }: { couleurs: Couleurs; espace?: Espace }) {
  const { ouvrirReglages } = useReglagesIA();
  const connexion = useConnexion(espace);
  return (
    <Pressable
      onPress={() => ouvrirReglages(espace)}
      accessibilityRole="button"
      accessibilityLabel="Changer d'IA"
      style={({ pressed }) => [styles.puce, { borderColor: c.bordure, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text numberOfLines={1} style={[styles.textePuce, { color: c.texte }]}>
        {FOURNISSEURS[connexion.fournisseur].nom.replace(/ \(.*\)/, '')} · {connexion.modele} ▾
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entete: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  titre: { fontSize: 32, fontWeight: '800' },
  titreSecondaire: { fontSize: 20, fontWeight: '800' },
  sousTitre: { fontSize: 14, marginTop: 2 },
  retour: { fontSize: 38, lineHeight: 38, fontWeight: '400', marginTop: -4 },
  puce: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, maxWidth: 200 },
  textePuce: { fontSize: 13, fontWeight: '600' },
});
