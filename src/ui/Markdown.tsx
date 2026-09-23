import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import type { Couleurs } from '../theme';
import { CodeColore } from './Coloration';
import { VueDiff } from './VueDiff';
import { statsDiff } from './diff';

import { POLICE_CODE } from './police';

export { POLICE_CODE };

export type BlocCode = { langage: string; chemin: string; code: string; complet: boolean };

type Segment = { type: 'texte'; texte: string } | ({ type: 'code' } & BlocCode);

/**
 * Découpe un texte Markdown en paragraphes et blocs de code.
 * Un bloc peut indiquer un chemin de fichier : ```tsx src/App.tsx
 */
export function decouper(texte: string): Segment[] {
  const segments: Segment[] = [];
  const lignes = texte.split('\n');
  let tampon: string[] = [];
  let bloc: (BlocCode & { lignes: string[] }) | null = null;

  const viderTexte = () => {
    const t = tampon.join('\n').trim();
    if (t) segments.push({ type: 'texte', texte: t });
    tampon = [];
  };

  for (const ligne of lignes) {
    const ouverture = ligne.match(/^\s*```\s*([^\s`]*)\s*(.*)$/);
    if (!bloc && ouverture) {
      viderTexte();
      const [, langage = '', reste = ''] = ouverture;
      const chemin = reste.replace(/^(?:fichier|file|path|chemin)\s*[:=]\s*/i, '').trim();
      bloc = { langage, chemin, code: '', complet: false, lignes: [] };
    } else if (bloc && /^\s*```\s*$/.test(ligne)) {
      segments.push({ type: 'code', ...finirBloc(bloc), complet: true });
      bloc = null;
    } else if (bloc) {
      bloc.lignes.push(ligne);
    } else {
      tampon.push(ligne);
    }
  }
  if (bloc) segments.push({ type: 'code', ...finirBloc(bloc), complet: false });
  viderTexte();
  return segments;
}

function finirBloc(b: BlocCode & { lignes: string[] }): BlocCode {
  let chemin = b.chemin;
  let lignes = b.lignes;
  // Chemin indiqué en commentaire sur la première ligne : // fichier : src/App.tsx
  const premiere = lignes[0]?.match(/^\s*(?:\/\/|#|<!--|\/\*)\s*(?:fichier|file|path|chemin)\s*[:=]\s*([^\s*>-]+)/i);
  if (!chemin && premiere) {
    chemin = premiere[1];
    lignes = lignes.slice(1);
  }
  if (chemin && !/[./]/.test(chemin)) chemin = ''; // pas un vrai chemin de fichier
  return { langage: b.langage, chemin, code: lignes.join('\n'), complet: true };
}

/** Extrait les blocs de code complets qui ont un chemin de fichier. */
export function blocsAvecFichier(texte: string): BlocCode[] {
  return decouper(texte).filter(
    (s): s is { type: 'code' } & BlocCode => s.type === 'code' && s.complet && !!s.chemin,
  );
}

type Props = {
  texte: string;
  couleurs: Couleurs;
  /** Si fourni, les blocs avec un chemin affichent un bouton « Enregistrer ». */
  onEnregistrerFichier?: (b: BlocCode) => void;
  /** Fichiers du projet (chemin → contenu) : sert à montrer ce que l'IA a changé. */
  fichiersExistants?: Record<string, string>;
  /** Si fourni, les blocs HTML affichent un bouton « ▶ Studio ». */
  onOuvrirStudio?: (b: BlocCode) => void;
};

export function estPageHTML(b: BlocCode) {
  return /^(html|htm|svg)$/i.test(b.langage) || /\.(html?|svg)$/i.test(b.chemin) || /^\s*<!doctype html/i.test(b.code);
}

export const Markdown = memo(function Markdown({
  texte,
  couleurs: c,
  onEnregistrerFichier,
  fichiersExistants,
  onOuvrirStudio,
}: Props) {
  const segments = decouper(texte);
  return (
    <View style={styles.pile}>
      {segments.map((s, i) =>
        s.type === 'code' ? (
          <BlocDeCode
            key={i}
            bloc={s}
            couleurs={c}
            onEnregistrer={onEnregistrerFichier && s.chemin && s.complet ? () => onEnregistrerFichier(s) : undefined}
            existant={s.chemin ? fichiersExistants?.[s.chemin] : undefined}
            onStudio={onOuvrirStudio && s.complet && estPageHTML(s) ? () => onOuvrirStudio(s) : undefined}
          />
        ) : (
          <Paragraphes key={i} texte={s.texte} couleurs={c} />
        ),
      )}
    </View>
  );
});

function Paragraphes({ texte, couleurs: c }: { texte: string; couleurs: Couleurs }) {
  return (
    <View style={styles.pile}>
      {texte.split(/\n{2,}/).map((para, i) => (
        <View key={i} style={styles.pilePetite}>
          {para.split('\n').map((ligne, j) => {
            const titre = ligne.match(/^(#{1,4})\s+(.*)$/);
            if (titre) {
              return (
                <Text key={j} style={[styles.titre, { color: c.texte, fontSize: titre[1].length <= 2 ? 19 : 17 }]}>
                  <EnLigne texte={titre[2]} couleurs={c} />
                </Text>
              );
            }
            const puce = ligne.match(/^(\s*)(?:[-*•]|(\d+)[.)])\s+(.*)$/);
            if (puce) {
              return (
                <View key={j} style={[styles.puce, { paddingLeft: Math.min(puce[1].length, 6) * 6 }]}>
                  <Text style={[styles.texte, { color: c.texteDoux }]}>{puce[2] ? `${puce[2]}.` : '•'}</Text>
                  <Text style={[styles.texte, styles.flex, { color: c.texte }]}>
                    <EnLigne texte={puce[3]} couleurs={c} />
                  </Text>
                </View>
              );
            }
            if (/^\s*(?:---|\*\*\*)\s*$/.test(ligne)) {
              return <View key={j} style={[styles.separateur, { backgroundColor: c.bordure }]} />;
            }
            return (
              <Text key={j} selectable style={[styles.texte, { color: c.texte }]}>
                <EnLigne texte={ligne} couleurs={c} />
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Gras (**x**), italique (*x*) et code en ligne (`x`). */
function EnLigne({ texte, couleurs: c }: { texte: string; couleurs: Couleurs }) {
  const morceaux = texte.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).filter(Boolean);
  return (
    <>
      {morceaux.map((m, i) => {
        if (m.startsWith('**') && m.endsWith('**') && m.length > 4) {
          return (
            <Text key={i} style={styles.gras}>
              {m.slice(2, -2)}
            </Text>
          );
        }
        if (m.startsWith('`') && m.endsWith('`') && m.length > 2) {
          return (
            <Text key={i} style={[styles.codeEnLigne, { backgroundColor: c.carte, color: c.accentTexte }]}>
              {m.slice(1, -1)}
            </Text>
          );
        }
        if (m.startsWith('*') && m.endsWith('*') && m.length > 2) {
          return (
            <Text key={i} style={styles.italique}>
              {m.slice(1, -1)}
            </Text>
          );
        }
        return m;
      })}
    </>
  );
}

function BlocDeCode({
  bloc,
  couleurs: c,
  onEnregistrer,
  existant,
  onStudio,
}: {
  bloc: BlocCode;
  couleurs: Couleurs;
  onEnregistrer?: () => void;
  /** Contenu actuel du fichier dans le projet (s'il existe). */
  existant?: string;
  onStudio?: () => void;
}) {
  const [copie, setCopie] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [ouvert, setOuvert] = useState<boolean | undefined>(undefined);
  const [voirDiff, setVoirDiff] = useState(false);
  const nbLignes = bloc.code.split('\n').length;
  // Les longs blocs terminés sont repliés par défaut (on les ouvre d'un toucher)
  const replie = ouvert === undefined ? bloc.complet && nbLignes > 30 : !ouvert;
  const existe = existant !== undefined;
  const stats = existe && bloc.complet ? statsDiff(existant!, bloc.code) : null;

  const copier = async () => {
    await Clipboard.setStringAsync(bloc.code);
    setCopie(true);
    setTimeout(() => setCopie(false), 1500);
  };

  return (
    <View style={[styles.bloc, { backgroundColor: c.carte, borderColor: c.bordure }]}>
      <View style={[styles.enteteBloc, { borderColor: c.bordure }, replie && { borderBottomWidth: 0 }]}>
        <Pressable
          onPress={() => setOuvert(replie)}
          style={styles.zoneTitreBloc}
          accessibilityRole="button"
          accessibilityLabel={replie ? 'Ouvrir le code' : 'Replier le code'}
        >
          <Text style={[styles.chevron, { color: c.accentTexte }]}>{replie ? '▸' : '▾'}</Text>
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={[styles.etiquetteBloc, { color: c.texte }]}>
              {bloc.chemin || bloc.langage || 'code'}
              {!bloc.complet ? ' …' : ''}
            </Text>
            <Text style={[styles.infoBloc, { color: c.texteDoux }]}>
              {nbLignes} ligne{nbLignes > 1 ? 's' : ''}
              {stats ? '  ' : existe || !bloc.chemin || !onEnregistrer ? '' : '  · nouveau fichier'}
              {stats && stats.ajouts + stats.retraits === 0 && 'identique'}
              {stats && stats.ajouts + stats.retraits > 0 && (
                <Text style={{ color: c.code.ajout, fontWeight: '800' }}>+{stats.ajouts} </Text>
              )}
              {stats && stats.ajouts + stats.retraits > 0 && (
                <Text style={{ color: c.code.retrait, fontWeight: '800' }}>−{stats.retraits}</Text>
              )}
            </Text>
          </View>
        </Pressable>
        <View style={styles.actions}>
          {onStudio && (
            <Pressable
              onPress={onStudio}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Voir dans le Studio"
              style={[styles.boutonBloc, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.texteBoutonBloc, { color: c.surAccent }]}>▶ Studio</Text>
            </Pressable>
          )}
          {onEnregistrer && (
            <Pressable
              onPress={() => {
                onEnregistrer();
                setEnregistre(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              style={[styles.boutonBloc, { backgroundColor: c.accent }]}
            >
              <Text style={[styles.texteBoutonBloc, { color: c.surAccent }]}>
                {enregistre ? 'Enregistré ✓' : existe ? 'Mettre à jour' : 'Enregistrer'}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={copier} hitSlop={8} accessibilityRole="button" accessibilityLabel="Copier le code">
            <Text style={[styles.texteBoutonBloc, { color: c.accentTexte }]}>{copie ? 'Copié ✓' : 'Copier'}</Text>
          </Pressable>
        </View>
      </View>
      {!replie && stats && (stats.ajouts > 0 || stats.retraits > 0) && (
        <View style={[styles.ongletsBloc, { borderColor: c.bordure }]}>
          {(['code', 'diff'] as const).map((v) => {
            const actif = (v === 'diff') === voirDiff;
            return (
              <Pressable key={v} onPress={() => setVoirDiff(v === 'diff')} style={[styles.ongletBloc, actif && { borderColor: c.accent }]}>
                <Text style={{ color: actif ? c.texte : c.texteDoux, fontWeight: '700', fontSize: 12 }}>
                  {v === 'code' ? 'Fichier complet' : 'Changements'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {!replie &&
        (voirDiff && existe ? (
          <VueDiff ancien={existant!} nouveau={bloc.code} couleurs={c} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.code, { color: c.code.texte }]}>
              <CodeColore code={bloc.code} langage={bloc.langage} chemin={bloc.chemin} couleurs={c} />
            </Text>
          </ScrollView>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pile: { gap: 10 },
  pilePetite: { gap: 4 },
  flex: { flex: 1 },
  texte: { fontSize: 16, lineHeight: 23 },
  titre: { fontWeight: '800', lineHeight: 25, marginTop: 4 },
  gras: { fontWeight: '700' },
  italique: { fontStyle: 'italic' },
  codeEnLigne: { fontFamily: POLICE_CODE, fontSize: 14 },
  puce: { flexDirection: 'row', gap: 8 },
  separateur: { height: 1, marginVertical: 6 },
  bloc: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  enteteBloc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  zoneTitreBloc: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 16, fontWeight: '800', width: 12 },
  etiquetteBloc: { fontFamily: POLICE_CODE, fontSize: 13, fontWeight: '700' },
  infoBloc: { fontSize: 11, marginTop: 1 },
  ongletsBloc: { flexDirection: 'row', gap: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  ongletBloc: { paddingVertical: 7, borderBottomWidth: 2, borderColor: 'transparent' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boutonBloc: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  texteBoutonBloc: { fontSize: 13, fontWeight: '700' },
  code: { fontFamily: POLICE_CODE, fontSize: 13, lineHeight: 19, padding: 12 },
});
