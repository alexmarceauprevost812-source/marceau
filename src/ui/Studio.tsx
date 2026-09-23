import { createElement, useState } from 'react';
import { Modal, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import type { Couleurs } from '../theme';
import type { Fichier } from '../types';

type Props = {
  /** HTML à afficher ; null = Studio fermé. */
  html: string | null;
  titre: string;
  couleurs: Couleurs;
  onFermer: () => void;
};

/** Le Studio : affiche en direct une page HTML créée par l'IA. */
export function Studio({ html, titre, couleurs: c, onFermer }: Props) {
  const [cle, setCle] = useState(0);
  if (html === null) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onFermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={[styles.barre, { borderColor: c.bordure }]}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
            <Text style={[styles.lien, { color: c.accentTexte }]}>Fermer</Text>
          </Pressable>
          <View style={styles.titreZone}>
            <Text style={[styles.titre, { color: c.texte }]}>▶ Studio</Text>
            <Text numberOfLines={1} style={{ color: c.texteDoux, fontSize: 12 }}>
              {titre}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => setCle((k) => k + 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Recharger">
              <Text style={[styles.lien, { color: c.accentTexte }]}>↻</Text>
            </Pressable>
            <Pressable
              onPress={() => Share.share({ title: titre, message: html }).catch(() => {})}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Text style={[styles.lien, { color: c.accentTexte }]}>Partager</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.flex, styles.page]}>
          {Platform.OS === 'web' ? (
            createElement('iframe', {
              key: cle,
              srcDoc: html,
              title: titre,
              sandbox: 'allow-scripts allow-forms allow-modals',
              style: { border: 0, width: '100%', height: '100%', background: '#fff' },
            })
          ) : (
            <WebView
              key={cle}
              originWhitelist={['*']}
              source={{ html }}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              style={styles.flex}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function dossierDe(chemin: string) {
  const i = chemin.lastIndexOf('/');
  return i === -1 ? '' : chemin.slice(0, i + 1);
}

function resoudre(base: string, relatif: string): string {
  const parties = (base + relatif.replace(/^\.\//, '')).split('/');
  const pile: string[] = [];
  for (const p of parties) {
    if (p === '..') pile.pop();
    else if (p !== '.' && p !== '') pile.push(p);
  }
  return pile.join('/');
}

/**
 * Prépare une page du projet pour le Studio : les fichiers CSS et JavaScript
 * du projet qu'elle utilise sont intégrés directement dans la page.
 */
export function assemblerHTML(html: string, cheminPage: string, fichiers: Fichier[]): string {
  const base = dossierDe(cheminPage);
  const trouver = (href: string) => {
    if (/^(https?:)?\/\//.test(href) || href.startsWith('data:')) return null;
    const chemin = resoudre(base, href.split(/[?#]/)[0]);
    return fichiers.find((f) => f.chemin === chemin || f.chemin === href.replace(/^\//, '')) ?? null;
  };
  return html
    .replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (balise, href: string) => {
      if (!/stylesheet/i.test(balise) && !/\.css/i.test(href)) return balise;
      const f = trouver(href);
      return f ? `<style>/* ${f.chemin} */\n${f.contenu}\n</style>` : balise;
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (balise, avant: string, src: string, apres: string) => {
      const f = trouver(src);
      if (!f) return balise;
      const attributs = `${avant} ${apres}`.replace(/\s+/g, ' ').trim();
      return `<script ${attributs}>/* ${f.chemin} */\n${f.contenu.replace(/<\/script/gi, '<\\/script')}\n</script>`;
    });
}

/** Trouve la page principale d'un projet (index.html en priorité). */
export function pagePrincipale(fichiers: Fichier[]): Fichier | null {
  const pages = fichiers.filter((f) => /\.html?$/i.test(f.chemin));
  return (
    pages.find((f) => /(^|\/)index\.html?$/i.test(f.chemin) && !f.chemin.includes('/')) ??
    pages.find((f) => /(^|\/)index\.html?$/i.test(f.chemin)) ??
    pages[0] ??
    null
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { backgroundColor: '#fff' },
  barre: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titreZone: { flex: 1, alignItems: 'center' },
  titre: { fontSize: 16, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  lien: { fontSize: 15, fontWeight: '700' },
});
