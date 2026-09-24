// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const COMMANDES_DE_DEPART: Commande[] = [
  { id: 'maj', nom: 'Mettre à jour Linux', commande: 'apk update && apk upgrade' },
  {
    id: 'securite',
    nom: 'Installer les outils de sécurité de base',
    // apk update d'abord (sinon apk add échoue). Le message final dépend du vrai résultat :
    // en cas d'échec (hors ligne, dépôt indisponible, disque plein), on ne dit pas « réussi ».
    commande:
      'apk update && apk add nmap tcpdump netcat-openbsd bind-tools curl wget python3 py3-pip git && { echo; echo "Termine. Tape le nom d un outil (ex. nmap) pour l utiliser. Sers-toi de ces outils uniquement sur TES appareils et reseaux, ou avec autorisation ecrite."; } || { echo; echo "Echec de l installation. Verifie ta connexion Internet et l espace disque, puis reessaie."; }',
  },
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
