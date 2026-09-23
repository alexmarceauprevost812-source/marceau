import { memo, useMemo, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import type { Changement } from '../ia/github';
import type { Couleurs } from '../theme';
import type { Fichier } from '../types';
import { CodeColore } from './Coloration';
import { statsDiff } from './diff';
import { POLICE_CODE } from './police';
import { VueDiff } from './VueDiff';

type Noeud = { nom: string; chemin: string; dossiers: Map<string, Noeud>; fichiers: Fichier[] };

function construireArbre(fichiers: Fichier[]): Noeud {
  const racine: Noeud = { nom: '', chemin: '', dossiers: new Map(), fichiers: [] };
  for (const f of fichiers) {
    const parties = f.chemin.split('/');
    let n = racine;
    for (const p of parties.slice(0, -1)) {
      const chemin = n.chemin ? `${n.chemin}/${p}` : p;
      if (!n.dossiers.has(p)) n.dossiers.set(p, { nom: p, chemin, dossiers: new Map(), fichiers: [] });
      n = n.dossiers.get(p)!;
    }
    n.fichiers.push(f);
  }
  return racine;
}

function compterFichiers(n: Noeud): number {
  let t = n.fichiers.length;
  n.dossiers.forEach((d) => (t += compterFichiers(d)));
  return t;
}

function icone(chemin: string) {
  const ext = chemin.split('.').pop()?.toLowerCase() ?? '';
  if (/^(html?|svg|xml)$/.test(ext)) return '🌐';
  if (/^(css|scss|less)$/.test(ext)) return '🎨';
  if (/^(js|jsx|ts|tsx|mjs|cjs)$/.test(ext)) return '📜';
  if (ext === 'py') return '🐍';
  if (/^(json|ya?ml|toml|ini|env)$/.test(ext)) return '⚙️';
  if (/^(md|txt)$/.test(ext)) return '📝';
  return '📄';
}

type Props = {
  fichiers: Fichier[];
  couleurs: Couleurs;
  changements: Changement[];
  onSauver: (chemin: string, contenu: string) => void;
  onSupprimer: (chemin: string) => void;
  onStudio: (f: Fichier) => void;
  onNouveau: (chemin: string) => void;
};

/**
 * Explorateur du projet, comme dans un éditeur de code : dossiers repliables
 * et fichiers qui s'ouvrent en panneaux (plusieurs à la fois).
 */
export function Explorateur({ fichiers, couleurs: c, changements, onSauver, onSupprimer, onStudio, onNouveau }: Props) {
  const arbre = useMemo(() => construireArbre(fichiers), [fichiers]);
  const [dossiersOuverts, setDossiersOuverts] = useState<Set<string>>(() => new Set());
  const [ouverts, setOuverts] = useState<Set<string>>(() => new Set());
  const [nouveau, setNouveau] = useState<string | null>(null);
  const etats = useMemo(() => new Map(changements.map((ch) => [ch.chemin, ch.etat])), [changements]);

  const basculer = (ensemble: Set<string>, cle: string) => {
    const copie = new Set(ensemble);
    if (copie.has(cle)) copie.delete(cle);
    else copie.add(cle);
    return copie;
  };

  const toutReplier = () => {
    setOuverts(new Set());
    setDossiersOuverts(new Set());
  };

  const toutDeplier = () => {
    const tous = new Set<string>();
    const parcourir = (n: Noeud) => n.dossiers.forEach((d) => (tous.add(d.chemin), parcourir(d)));
    parcourir(arbre);
    setDossiersOuverts(tous);
  };

  const rendreNoeud = (n: Noeud, profondeur: number): ReactNode[] => {
    const lignes: ReactNode[] = [];
    [...n.dossiers.values()]
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .forEach((d) => {
        const ouvert = dossiersOuverts.has(d.chemin);
        const nbChangements = changements.filter((ch) => ch.chemin.startsWith(`${d.chemin}/`)).length;
        lignes.push(
          <Pressable
            key={`d:${d.chemin}`}
            onPress={() => setDossiersOuverts((e) => basculer(e, d.chemin))}
            accessibilityRole="button"
            accessibilityLabel={`${ouvert ? 'Fermer' : 'Ouvrir'} le dossier ${d.nom}`}
            style={({ pressed }) => [styles.ligne, { paddingLeft: 12 + profondeur * 16, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.chevron, { color: c.accentTexte }]}>{ouvert ? '▾' : '▸'}</Text>
            <Text style={styles.icone}>{ouvert ? '📂' : '📁'}</Text>
            <Text numberOfLines={1} style={[styles.nomDossier, { color: c.texte }]}>
              {d.nom}
            </Text>
            {nbChangements > 0 && <View style={[styles.point, { backgroundColor: c.accent }]} />}
            <Text style={{ color: c.texteDoux, fontSize: 12 }}>{compterFichiers(d)}</Text>
          </Pressable>,
        );
        if (ouvert) lignes.push(...rendreNoeud(d, profondeur + 1));
      });
    [...n.fichiers]
      .sort((a, b) => a.chemin.localeCompare(b.chemin))
      .forEach((f) => {
        lignes.push(
          <PanneauFichier
            key={`f:${f.chemin}`}
            fichier={f}
            profondeur={profondeur}
            ouvert={ouverts.has(f.chemin)}
            etat={etats.get(f.chemin)}
            couleurs={c}
            onBasculer={() => setOuverts((e) => basculer(e, f.chemin))}
            onSauver={(contenu) => onSauver(f.chemin, contenu)}
            onSupprimer={() => onSupprimer(f.chemin)}
            onStudio={/\.html?$/i.test(f.chemin) ? () => onStudio(f) : undefined}
          />,
        );
      });
    return lignes;
  };

  const supprimes = changements.filter((ch) => ch.etat === 'supprime');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.barreOutils}>
        <Text style={[styles.titreExplorateur, { color: c.texteDoux }]}>
          EXPLORATEUR · {fichiers.length} FICHIER{fichiers.length > 1 ? 'S' : ''}
        </Text>
        <View style={styles.actionsOutils}>
          <Pressable onPress={() => setNouveau('')} hitSlop={8} accessibilityLabel="Nouveau fichier">
            <Text style={[styles.outil, { color: c.accentTexte }]}>＋</Text>
          </Pressable>
          <Pressable onPress={toutDeplier} hitSlop={8} accessibilityLabel="Tout déplier">
            <Text style={[styles.outil, { color: c.accentTexte }]}>⊞</Text>
          </Pressable>
          <Pressable onPress={toutReplier} hitSlop={8} accessibilityLabel="Tout replier">
            <Text style={[styles.outil, { color: c.accentTexte }]}>⊟</Text>
          </Pressable>
        </View>
      </View>

      {nouveau !== null && (
        <View style={[styles.nouveau, { borderColor: c.accent }]}>
          <TextInput
            value={nouveau}
            onChangeText={setNouveau}
            placeholder="chemin/du/fichier.js"
            placeholderTextColor={c.texteDoux}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={[styles.champNouveau, { color: c.texte, fontFamily: POLICE_CODE }]}
            onSubmitEditing={() => {
              if (nouveau.trim()) onNouveau(nouveau.trim().replace(/^\/+/, ''));
              setNouveau(null);
            }}
          />
          <Pressable
            onPress={() => {
              if (nouveau.trim()) onNouveau(nouveau.trim().replace(/^\/+/, ''));
              setNouveau(null);
            }}
            style={[styles.boutonMini, { backgroundColor: c.accent }]}
          >
            <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 13 }}>Créer</Text>
          </Pressable>
          <Pressable onPress={() => setNouveau(null)} hitSlop={8}>
            <Text style={{ color: c.danger, fontWeight: '800' }}>✕</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.cadre, { borderColor: c.bordure, backgroundColor: c.carte }]}>
        {fichiers.length ? (
          rendreNoeud(arbre, 0)
        ) : (
          <Text style={[styles.vide, { color: c.texteDoux }]}>
            Aucun fichier. Crée-en un avec ＋, ou demande à Codex d’écrire du code puis touche « Enregistrer ».
          </Text>
        )}
      </View>

      {supprimes.length > 0 && (
        <Text style={{ color: c.danger, fontSize: 13, marginTop: 8 }}>
          Supprimés (seront retirés de GitHub au prochain envoi) : {supprimes.map((s) => s.chemin).join(', ')}
        </Text>
      )}
    </ScrollView>
  );
}

const PanneauFichier = memo(function PanneauFichier({
  fichier: f,
  profondeur,
  ouvert,
  etat,
  couleurs: c,
  onBasculer,
  onSauver,
  onSupprimer,
  onStudio,
}: {
  fichier: Fichier;
  profondeur: number;
  ouvert: boolean;
  etat?: Changement['etat'];
  couleurs: Couleurs;
  onBasculer: () => void;
  onSauver: (contenu: string) => void;
  onSupprimer: () => void;
  onStudio?: () => void;
}) {
  const [edition, setEdition] = useState<string | null>(null);
  const [voirDiff, setVoirDiff] = useState(false);
  const [copie, setCopie] = useState(false);
  const nom = f.chemin.split('/').pop()!;
  const lignes = f.contenu.split('\n');
  const stats = etat === 'modifie' && f.origine !== undefined ? statsDiff(f.origine, f.contenu) : null;
  const badge = etat === 'ajoute' ? 'A' : etat === 'modifie' ? 'M' : null;

  return (
    <View>
      <Pressable
        onPress={onBasculer}
        accessibilityRole="button"
        accessibilityLabel={`${ouvert ? 'Fermer' : 'Ouvrir'} ${f.chemin}`}
        style={({ pressed }) => [
          styles.ligne,
          { paddingLeft: 12 + profondeur * 16, opacity: pressed ? 0.6 : 1 },
          ouvert && { backgroundColor: c.fond },
        ]}
      >
        <Text style={[styles.chevron, { color: c.accentTexte }]}>{ouvert ? '▾' : '▸'}</Text>
        <Text style={styles.icone}>{icone(f.chemin)}</Text>
        <Text numberOfLines={1} style={[styles.nomFichier, { color: c.texte }]}>
          {nom}
        </Text>
        {stats && (
          <Text style={{ fontSize: 11, fontWeight: '800' }}>
            <Text style={{ color: c.code.ajout }}>+{stats.ajouts} </Text>
            <Text style={{ color: c.code.retrait }}>−{stats.retraits}</Text>
          </Text>
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: c.accent }]}>
            <Text style={{ color: c.surAccent, fontSize: 10, fontWeight: '900' }}>{badge}</Text>
          </View>
        )}
      </Pressable>

      {ouvert && (
        <View style={[styles.panneau, { borderColor: c.bordure, backgroundColor: c.fond }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outilsPanneau}>
            {edition === null ? (
              <>
                <BoutonPanneau texte="✎ Modifier" couleurs={c} onPress={() => setEdition(f.contenu)} />
                {stats && (
                  <BoutonPanneau
                    texte={voirDiff ? 'Fichier complet' : '± Changements'}
                    couleurs={c}
                    onPress={() => setVoirDiff(!voirDiff)}
                  />
                )}
                {onStudio && <BoutonPanneau texte="▶ Studio" couleurs={c} plein onPress={onStudio} />}
                <BoutonPanneau
                  texte={copie ? 'Copié ✓' : 'Copier'}
                  couleurs={c}
                  onPress={async () => {
                    await Clipboard.setStringAsync(f.contenu);
                    setCopie(true);
                    setTimeout(() => setCopie(false), 1500);
                  }}
                />
                <BoutonPanneau
                  texte="Supprimer"
                  couleurs={c}
                  danger
                  onPress={() =>
                    Alert.alert('Supprimer ce fichier ?', f.chemin, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: onSupprimer },
                    ])
                  }
                />
              </>
            ) : (
              <>
                <BoutonPanneau
                  texte="Enregistrer"
                  couleurs={c}
                  plein
                  onPress={() => {
                    onSauver(edition);
                    setEdition(null);
                  }}
                />
                <BoutonPanneau texte="Annuler" couleurs={c} onPress={() => setEdition(null)} />
              </>
            )}
          </ScrollView>

          {edition !== null ? (
            <TextInput
              value={edition}
              onChangeText={setEdition}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              scrollEnabled={false}
              style={[styles.code, styles.editeur, { color: c.texte, backgroundColor: c.carte, borderColor: c.accent }]}
            />
          ) : voirDiff && stats && f.origine !== undefined ? (
            <VueDiff ancien={f.origine} nouveau={f.contenu} couleurs={c} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.codeAvecNumeros}>
                <Text style={[styles.code, styles.numeros, { color: c.texteDoux, borderColor: c.bordure }]}>
                  {lignes.map((_, i) => i + 1).join('\n')}
                </Text>
                <Text selectable style={[styles.code, { color: c.code.texte, paddingRight: 16 }]}>
                  <CodeColore code={f.contenu} langage="" chemin={f.chemin} couleurs={c} />
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
});

function BoutonPanneau({
  texte,
  couleurs: c,
  onPress,
  plein,
  danger,
}: {
  texte: string;
  couleurs: Couleurs;
  onPress: () => void;
  plein?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.boutonMini,
        plein ? { backgroundColor: c.accent } : { borderWidth: 1, borderColor: danger ? c.danger : c.bordure },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={{ color: plein ? c.surAccent : danger ? c.danger : c.texte, fontWeight: '700', fontSize: 13 }}>{texte}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenu: { paddingHorizontal: 12, paddingBottom: 30 },
  barreOutils: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 8 },
  titreExplorateur: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  actionsOutils: { flexDirection: 'row', gap: 18 },
  outil: { fontSize: 20, fontWeight: '700' },
  cadre: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden', paddingVertical: 4 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingVertical: 9 },
  chevron: { width: 12, fontSize: 14, fontWeight: '800' },
  icone: { fontSize: 15 },
  nomDossier: { flex: 1, fontSize: 15, fontWeight: '700' },
  nomFichier: { flex: 1, fontSize: 15, fontFamily: POLICE_CODE },
  point: { width: 8, height: 8, borderRadius: 4 },
  badge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  panneau: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginBottom: 2 },
  outilsPanneau: { gap: 8, padding: 8 },
  boutonMini: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  codeAvecNumeros: { flexDirection: 'row', paddingVertical: 8 },
  numeros: { textAlign: 'right', paddingHorizontal: 8, borderRightWidth: StyleSheet.hairlineWidth, marginRight: 10 },
  code: { fontFamily: POLICE_CODE, fontSize: 13, lineHeight: 19 },
  editeur: { margin: 8, padding: 10, borderRadius: 8, borderWidth: 1, textAlignVertical: 'top', minHeight: 200 },
  vide: { padding: 16, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  nouveau: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, marginBottom: 10 },
  champNouveau: { flex: 1, paddingVertical: 10, fontSize: 14 },
});
