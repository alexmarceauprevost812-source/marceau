// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { FlatList, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BIBLIOTHEQUES_JS, COMPOSANTS_NATIFS, LICENCE_MARCEAU } from '../licences/generees';
import type { Couleurs } from '../theme';

/** Code source des programmes GPL/LGPL inclus : publié avec chaque APK. */
const SOURCES_GPL = 'https://github.com/alexmarceauprevost812-source/marceau/releases/latest';
const DEPOT = 'https://github.com/alexmarceauprevost812-source/marceau';

type Texte = { titre: string; contenu: string };

/** Licences de Marceau et de tous les logiciels libres qu'il contient. */
export function EcranLicences({ visible, couleurs: c, onFermer }: { visible: boolean; couleurs: Couleurs; onFermer: () => void }) {
  const [texte, setTexte] = useState<Texte | null>(null);
  const [voirJs, setVoirJs] = useState(false);
  const js = useMemo(() => BIBLIOTHEQUES_JS, []);

  const lien = (libelle: string, url: string) => (
    <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link">
      <Text style={[styles.lien, { color: c.accentTexte }]}>{libelle}</Text>
    </Pressable>
  );

  const carte = (titre: string, sousTitre: string, onPress: () => void, detail?: string) => (
    <Pressable
      key={titre}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.carte, { borderColor: c.bordure, backgroundColor: c.carte, opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.flex}>
        <Text style={[styles.nom, { color: c.texte }]}>{titre}</Text>
        <Text style={[styles.petit, { color: c.texteDoux }]}>{sousTitre}</Text>
        {!!detail && <Text style={[styles.petit, { color: c.texteDoux }]}>{detail}</Text>}
      </View>
      <Text style={[styles.fleche, { color: c.texteDoux }]}>›</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => (texte ? setTexte(null) : onFermer())}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.barre, { borderColor: c.bordure }]}>
          <Pressable onPress={() => (texte ? setTexte(null) : onFermer())} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.action, { color: c.accentTexte }]}>{texte ? '‹ Retour' : 'Fermer'}</Text>
          </Pressable>
          <Text numberOfLines={1} style={[styles.titreBarre, { color: c.texte }]}>
            {texte ? texte.titre : 'Licences'}
          </Text>
          <View style={styles.espace} />
        </View>

        {texte ? (
          <ScrollView contentContainerStyle={styles.contenu}>
            <Text selectable style={[styles.texteLicence, { color: c.texte }]}>
              {texte.contenu}
            </Text>
          </ScrollView>
        ) : voirJs ? (
          <FlatList
            data={js}
            keyExtractor={(b) => `${b.nom}@${b.version}`}
            contentContainerStyle={styles.contenu}
            ListHeaderComponent={
              <Pressable onPress={() => setVoirJs(false)} accessibilityRole="button" style={styles.retourListe}>
                <Text style={[styles.action, { color: c.accentTexte }]}>‹ Licences</Text>
              </Pressable>
            }
            renderItem={({ item }) => (
              <View style={[styles.ligneJs, { borderColor: c.bordure }]}>
                <Text style={[styles.petit, styles.flex, { color: c.texte }]} numberOfLines={1}>
                  {item.nom} <Text style={{ color: c.texteDoux }}>{item.version}</Text>
                </Text>
                <Text style={[styles.petit, { color: c.texteDoux }]}>{item.licence}</Text>
              </View>
            )}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.contenu}>
            <Text style={[styles.intro, { color: c.texte }]}>
              Marceau est un logiciel libre sous licence MIT. Il contient d'autres logiciels libres, dont voici les
              licences.
            </Text>
            {carte('Marceau', 'MIT — le code de l’appli', () => setTexte({ titre: 'Marceau — MIT', contenu: LICENCE_MARCEAU }))}
            {lien('Code source de Marceau sur GitHub', DEPOT)}

            <Text style={[styles.section, { color: c.texte }]}>Inclus dans l’APK (Terminal)</Text>
            {COMPOSANTS_NATIFS.map((k) =>
              carte(`${k.nom} ${k.version}`, `${k.licence} — ${k.role}`, () =>
                setTexte({ titre: k.nom, contenu: `${k.nom} ${k.version}\n© ${k.auteurs}\nSource : ${k.source}\n\n${k.texte}` }),
              ),
            )}
            <Text style={[styles.petit, { color: c.texteDoux }]}>
              PRoot (GPL) et talloc (LGPL) sont compilés à partir de leur code source, sans modification. Ce code source
              et le script de compilation sont publiés avec chaque version de l’APK (fichier marceau-sources-linux).
            </Text>
            {lien('Télécharger le code source (GitHub, dernière version)', SOURCES_GPL)}
            <Text style={[styles.petit, { color: c.texteDoux }]}>
              Le rootfs de Kali Linux (NetHunter) n’est pas inclus dans l’APK : ton téléphone le télécharge
              directement depuis les serveurs officiels de Kali quand tu l’installes, avec vérification de
              l’empreinte fournie par Kali.
            </Text>

            <Text style={[styles.section, { color: c.texte }]}>Bibliothèques JavaScript</Text>
            {carte(`${js.length} bibliothèques`, 'React Native, Expo et leurs dépendances — toutes libres', () => setVoirJs(true))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  action: { fontSize: 16, fontWeight: '700' },
  titreBarre: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  espace: { width: 60 },
  contenu: { padding: 16, gap: 10 },
  intro: { fontSize: 15, lineHeight: 22 },
  section: { fontSize: 18, fontWeight: '800', marginTop: 14 },
  carte: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  nom: { fontSize: 16, fontWeight: '700' },
  petit: { fontSize: 13, lineHeight: 19 },
  fleche: { fontSize: 26, fontWeight: '300' },
  lien: { fontSize: 14, fontWeight: '700', paddingVertical: 4 },
  texteLicence: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  ligneJs: { flexDirection: 'row', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  retourListe: { paddingBottom: 8 },
});
