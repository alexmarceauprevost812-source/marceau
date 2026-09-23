import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';

import type { Couleurs } from '../theme';

/** Une commande de la fiche d'aide : la commande et son explication. */
type Commande = { cmd: string; quoi: string };
type Section = { titre: string; commandes: Commande[] };

/** Fiche d'aide du Linux : les commandes de base, à copier d'un doigt. */
const SECTIONS: Section[] = [
  {
    titre: '📂 Se déplacer',
    commandes: [
      { cmd: 'pwd', quoi: 'Où suis-je ? (dossier courant)' },
      { cmd: 'ls', quoi: 'Liste les fichiers' },
      { cmd: 'ls -la', quoi: 'Liste tout, avec les détails' },
      { cmd: 'cd dossier', quoi: 'Entrer dans un dossier' },
      { cmd: 'cd ..', quoi: "Remonter d'un dossier" },
      { cmd: 'cd', quoi: 'Revenir à la maison (/root)' },
    ],
  },
  {
    titre: '📝 Fichiers et dossiers',
    commandes: [
      { cmd: 'mkdir test', quoi: 'Créer un dossier' },
      { cmd: 'touch fichier.txt', quoi: 'Créer un fichier vide' },
      { cmd: 'cat fichier.txt', quoi: "Afficher le contenu d'un fichier" },
      { cmd: 'nano fichier.txt', quoi: 'Éditer (Ctrl+O enregistre, Ctrl+X quitte)' },
      { cmd: 'cp a b', quoi: 'Copier a vers b' },
      { cmd: 'mv a b', quoi: 'Déplacer ou renommer a en b' },
      { cmd: 'rm fichier.txt', quoi: 'Supprimer un fichier' },
    ],
  },
  {
    titre: '📦 Installer des outils',
    commandes: [
      { cmd: 'apk update', quoi: 'Mettre à jour la liste (au début, une fois)' },
      { cmd: 'apk add nmap', quoi: 'Installer un outil (jamais « sudo »)' },
      { cmd: 'apk search mot', quoi: 'Chercher un outil' },
      { cmd: 'apk info', quoi: 'Voir ce qui est installé' },
    ],
  },
  {
    titre: '🧰 Outils sûrs pour apprendre (sur TON réseau)',
    commandes: [
      { cmd: 'apk add nmap', quoi: 'Voir les appareils de ton réseau : nmap 192.168.1.0/24' },
      { cmd: 'apk add tcpdump', quoi: 'Observer le trafic réseau' },
      { cmd: 'apk add python3 git', quoi: 'Programmer et récupérer du code' },
      { cmd: 'apk add curl', quoi: 'Tester un site ou une API' },
    ],
  },
  {
    titre: '💡 Astuces',
    commandes: [
      { cmd: 'clear', quoi: "Nettoyer l'écran" },
      { cmd: 'nmap --help', quoi: "Voir l'aide d'un outil" },
      { cmd: 'exit', quoi: 'Fermer la session' },
    ],
  },
];

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

export function AideLinux({ visible, couleurs: c, onFermer }: Props) {
  const [copie, setCopie] = useState<string | null>(null);

  const copier = async (cmd: string) => {
    try {
      await Clipboard.setStringAsync(cmd);
      setCopie(cmd);
      setTimeout(() => setCopie((actuel) => (actuel === cmd ? null : actuel)), 1500);
    } catch {}
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.entete, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Fermer</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>📖 Commandes Linux</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.corps}>
          <Text style={[styles.intro, { color: c.texteDoux }]}>
            Touche une commande pour la copier, puis colle-la dans le terminal. N'utilise jamais « sudo » (tu es déjà
            administrateur).
          </Text>

          {SECTIONS.map((s) => (
            <View key={s.titre} style={styles.section}>
              <Text style={[styles.sousTitre, { color: c.texte }]}>{s.titre}</Text>
              {s.commandes.map((cmd) => {
                const estCopie = copie === cmd.cmd;
                return (
                  <Pressable
                    key={cmd.cmd + cmd.quoi}
                    onPress={() => copier(cmd.cmd)}
                    accessibilityRole="button"
                    accessibilityLabel={`Copier ${cmd.cmd}`}
                    style={({ pressed }) => [
                      styles.ligne,
                      { backgroundColor: c.carte, borderColor: estCopie ? c.accent : c.bordure, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text style={[styles.cmd, { color: c.accentTexte }]}>{cmd.cmd}</Text>
                      <Text style={[styles.quoi, { color: c.texteDoux }]}>{cmd.quoi}</Text>
                    </View>
                    <Text style={[styles.copier, { color: estCopie ? c.accent : c.texteDoux }]}>
                      {estCopie ? '✓ copié' : '⧉'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          <Text style={[styles.pied, { color: c.texteDoux }]}>
            Sers-toi de ces outils uniquement sur tes propres appareils et réseaux, ou avec une autorisation écrite.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lien: { fontSize: 15, fontWeight: '700' },
  titre: { fontSize: 17, fontWeight: '800' },
  corps: { padding: 16, gap: 18 },
  intro: { fontSize: 14, lineHeight: 20 },
  section: { gap: 8 },
  sousTitre: { fontSize: 16, fontWeight: '800' },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cmd: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  quoi: { fontSize: 13, marginTop: 2 },
  copier: { fontSize: 14, fontWeight: '700' },
  pied: { fontSize: 13, lineHeight: 19, marginTop: 4, fontStyle: 'italic' },
});
