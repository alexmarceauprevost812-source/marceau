// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Terminal } from '../../modules/marceau-terminal';
import { nouvelId, usePersistant } from '../hooks/usePersistant';
import type { Couleurs } from '../theme';

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  onFermer: () => void;
  /** Lance une ligne de commande dans le terminal Linux (la tape puis Entrée). */
  onLancer: (commande: string) => void;
};

/** Une commande de ta bibliothèque : un nom à toucher et la ligne de commande qu'il lance. */
type Commande = { id: string; nom: string; commande: string };

/** Catalogue officiel de tous les paquets Alpine (ce que « apk add » peut installer). */
const LIEN_CATALOGUE = 'https://pkgs.alpinelinux.org/packages';

/** Un pack d'outils à installer d'un toucher (thème → paquets Alpine). */
type Pack = { nom: string; icone: string; paquets: string[] };

// Outils de type Kali qui existent DANS Alpine (le reste s'installe à la demande avec « apk add »).
// Beaucoup d'outils de Kali ne sont pas empaquetés pour Alpine : ceux-là ne sont pas listés ici.
const PACKS: Pack[] = [
  { nom: 'Réseau et scan', icone: '🌐', paquets: ['nmap', 'nmap-scripts', 'masscan', 'tcpdump', 'netcat-openbsd', 'socat', 'hping3', 'bind-tools', 'mtr', 'curl', 'wget', 'openssh'] },
  { nom: 'Wi-Fi et mots de passe', icone: '📶', paquets: ['aircrack-ng', 'wireless-tools', 'iw', 'john', 'hashcat', 'hydra'] },
  { nom: 'Web', icone: '🕸️', paquets: ['nikto', 'sqlmap', 'whatweb', 'gobuster', 'curl', 'wget'] },
  { nom: 'Analyse et rétro-ingénierie', icone: '🔬', paquets: ['radare2', 'binwalk', 'foremost', 'wireshark', 'openssl', 'gnupg'] },
  { nom: 'Programmation', icone: '💻', paquets: ['python3', 'py3-pip', 'nodejs', 'npm', 'git', 'gcc', 'make'] },
  { nom: 'Fichiers et système', icone: '🗂️', paquets: ['nano', 'vim', 'htop', 'tree', 'jq', 'file', 'unzip'] },
];

/**
 * Commande d'installation d'un pack : met à jour, puis installe les paquets UN PAR UN — ainsi un
 * outil absent d'Alpine n'empêche pas les autres de s'installer. Un résumé indique ce qui a réussi.
 */
function commandeInstall(paquets: string[]): string {
  const liste = paquets.join(' ');
  return (
    'apk update; ok=0; total=0; for p in ' +
    liste +
    '; do total=$((total+1)); if apk add "$p" >/dev/null 2>&1; then ok=$((ok+1)); echo "  [ok] $p"; else echo "  [absent d Alpine] $p"; fi; done; ' +
    'echo; echo "$ok/$total installes. Les [absent] ne sont pas dans Alpine (essaie: apk search <mot>). ' +
    'Sers-toi de ces outils uniquement sur TES appareils et reseaux, ou avec autorisation ecrite."'
  );
}

const COMMANDES_DE_DEPART: Commande[] = [
  { id: 'maj', nom: 'Mettre à jour Linux', commande: 'apk update && apk upgrade' },
  { id: 'chercher', nom: 'Chercher un outil (change le mot)', commande: 'apk search nmap' },
  { id: 'disque', nom: 'Espace disque', commande: 'df -h / && du -sh ~/* 2>/dev/null | sort -h | tail -5' },
  { id: 'telephone', nom: 'Mes fichiers du téléphone', commande: 'ls -la /telephone' },
  { id: 'git', nom: 'Statut git', commande: 'git status' },
];

/**
 * Mes outils : ta bibliothèque de commandes (nom → ligne de commande, enregistrée sur le téléphone)
 * et ce que tu as installé dans le Linux avec « apk add ». Tout se lance d'un toucher.
 */
export function MesOutils({ visible, couleurs: c, onFermer, onLancer }: Props) {
  const [outils, setOutils] = useState<string[]>([]);
  const [commandes, setCommandes] = usePersistant<Commande[]>('marceau:commandes-linux', COMMANDES_DE_DEPART);
  const [nom, setNom] = useState('');
  const [ligne, setLigne] = useState('');

  const ajouter = () => {
    const n = nom.trim();
    const l = ligne.trim();
    if (!n || !l) {
      Alert.alert('Il manque quelque chose', 'Donne un nom au bouton et écris la commande qu’il doit lancer.');
      return;
    }
    setCommandes((liste) => [...liste, { id: nouvelId(), nom: n, commande: l }]);
    setNom('');
    setLigne('');
  };

  const supprimer = (cmd: Commande) =>
    Alert.alert('Supprimer ce bouton ?', `« ${cmd.nom} » : ${cmd.commande}`, [
      { text: 'Non', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => setCommandes((l) => l.filter((x) => x.id !== cmd.id)) },
    ]);

  // Relue à chaque ouverture : un outil vient peut-être d'être installé.
  useEffect(() => {
    if (!visible) return;
    try {
      setOutils(Terminal?.outilsLinux() ?? []);
    } catch {
      setOutils([]);
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.entete, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Fermer</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>🧰 Mes outils</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
          <Text style={[styles.section, { color: c.texte }]}>📦 Packs d’outils</Text>
          <Text style={[styles.intro, { color: c.texteDoux }]}>
            Alpine a plus de 28 000 outils : impossible de tous les mettre d’avance. Touche un thème pour installer
            ses outils d’un coup. Le reste s’installe à la demande avec « apk add ».
          </Text>
          <Pressable
            onPress={() => Linking.openURL(LIEN_CATALOGUE)}
            accessibilityRole="button"
            accessibilityLabel="Ouvrir le catalogue Alpine dans le navigateur"
            style={({ pressed }) => [
              styles.ligne,
              { backgroundColor: c.carte, borderColor: c.accent, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <View style={styles.flex}>
              <Text style={[styles.nom, { color: c.texte }]}>📖 Catalogue Alpine (tous les outils)</Text>
              <Text numberOfLines={1} style={[styles.detail, { color: c.accentTexte }]}>
                Chercher parmi les 28 000+ outils, puis « apk add son-nom »
              </Text>
            </View>
            <Text style={[styles.lancer, { color: c.texteDoux }]}>↗</Text>
          </Pressable>
          {PACKS.map((pack) => (
            <Pressable
              key={pack.nom}
              onPress={() => onLancer(commandeInstall(pack.paquets))}
              accessibilityRole="button"
              accessibilityLabel={`Installer les outils : ${pack.nom}`}
              style={({ pressed }) => [
                styles.ligne,
                { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.flex}>
                <Text style={[styles.nom, { color: c.texte }]}>
                  {pack.icone} {pack.nom}
                </Text>
                <Text numberOfLines={1} style={[styles.detail, { color: c.accentTexte }]}>
                  {pack.paquets.join(' ')}
                </Text>
              </View>
              <Text style={[styles.lancer, { color: c.texteDoux }]}>⬇</Text>
            </Pressable>
          ))}

          <Text style={[styles.section, { color: c.texte }]}>⚡ Mes commandes</Text>
          <Text style={[styles.intro, { color: c.texteDoux }]}>
            Touche un bouton pour lancer sa commande dans le terminal. Appui long pour le supprimer.
          </Text>
          {commandes.map((cmd) => (
            <Pressable
              key={cmd.id}
              onPress={() => onLancer(cmd.commande)}
              onLongPress={() => supprimer(cmd)}
              accessibilityRole="button"
              accessibilityLabel={`Lancer ${cmd.nom}`}
              accessibilityHint="Appui long pour supprimer"
              style={({ pressed }) => [
                styles.ligne,
                { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.flex}>
                <Text style={[styles.nom, { color: c.texte }]}>{cmd.nom}</Text>
                <Text numberOfLines={1} style={[styles.detail, { color: c.accentTexte }]}>
                  {cmd.commande}
                </Text>
              </View>
              <Text style={[styles.lancer, { color: c.texteDoux }]}>▶</Text>
            </Pressable>
          ))}
          <View style={[styles.ajout, { backgroundColor: c.carte, borderColor: c.bordure }]}>
            <TextInput
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du bouton (ex. : Voir mon réseau)"
              placeholderTextColor={c.texteDoux}
              style={[styles.champ, { color: c.texte, borderColor: c.bordure }]}
              accessibilityLabel="Nom du nouveau bouton"
            />
            <TextInput
              value={ligne}
              onChangeText={setLigne}
              placeholder="Commande (ex. : ip addr)"
              placeholderTextColor={c.texteDoux}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.champ, styles.champCode, { color: c.texte, borderColor: c.bordure }]}
              accessibilityLabel="Commande du nouveau bouton"
              onSubmitEditing={ajouter}
            />
            <Pressable onPress={ajouter} accessibilityRole="button" style={[styles.bouton, { backgroundColor: c.accent }]}>
              <Text style={{ color: c.surAccent, fontWeight: '800' }}>＋ Ajouter le bouton</Text>
            </Pressable>
          </View>

          <Text style={[styles.section, { color: c.texte }]}>🧰 Outils installés</Text>
          {outils.length === 0 ? (
            <Text style={[styles.intro, { color: c.texteDoux }]}>
              Aucun outil installé pour l’instant. Dans le terminal, tape par exemple « apk add nano python3 git » :
              ils apparaîtront ici.
            </Text>
          ) : (
            <>
              <Text style={[styles.intro, { color: c.texteDoux }]}>
                {outils.length} outil{outils.length > 1 ? 's' : ''} installé{outils.length > 1 ? 's' : ''}. Touche un
                outil pour le lancer dans le terminal.
              </Text>
              {outils.map((o) => (
                <Pressable
                  key={o}
                  onPress={() => onLancer(o)}
                  accessibilityRole="button"
                  accessibilityLabel={`Lancer ${o}`}
                  style={({ pressed }) => [
                    styles.ligne,
                    { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.cmd, { color: c.accentTexte }]}>{o}</Text>
                  <Text style={[styles.lancer, { color: c.texteDoux }]}>▶</Text>
                </Pressable>
              ))}
              <Text style={[styles.pied, { color: c.texteDoux }]}>
                Si un outil ne se lance pas, son programme porte peut-être un autre nom : essaie « apk info -L {'<outil>'} ».
                Pour en retirer un : « apk del {'<outil>'} ».
              </Text>
            </>
          )}
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
  corps: { padding: 16, gap: 8 },
  section: { fontSize: 16, fontWeight: '800', marginTop: 8 },
  nom: { fontSize: 15, fontWeight: '700' },
  detail: { fontSize: 13, fontFamily: 'monospace', marginTop: 2 },
  ajout: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, gap: 8 },
  champ: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  champCode: { fontFamily: 'monospace' },
  bouton: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  cmd: { fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  lancer: { fontSize: 16, fontWeight: '800' },
  pied: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
