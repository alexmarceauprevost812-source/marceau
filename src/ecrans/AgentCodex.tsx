import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { lancerAgent, type EtapeAgent, type FichiersAgent, type ResultatAgent } from '../ia/agentCodex';
import type { MessageIA } from '../ia/client';
import { FOURNISSEURS, manqueCle } from '../ia/fournisseurs';
import { useConnexion, useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import type { Fichier, Projet } from '../types';
import { CarteChangement, totalChangements, type Changement } from '../ui/CarteChangement';
import { Markdown } from '../ui/Markdown';

/** Consigne de l'agent : l'arborescence seulement, Claude lit lui-même les fichiers utiles. */
function consigneAgent(p: Projet): string {
  const arbre = p.fichiers.map((f) => `- ${f.chemin} (${f.contenu.split('\n').length} lignes)`).join('\n');
  return [
    'Tu es Codex, un ingénieur logiciel expert intégré à l’application Marceau, en MODE AGENT : tu travailles',
    'toi-même dans le projet avec tes outils (lister_fichiers, lire_fichier, ecrire_fichier, modifier_fichier,',
    'supprimer_fichier). La personne qui te parle apprend à coder : réponds en français, simplement, mais code comme',
    'un professionnel.',
    '',
    'MÉTHODE :',
    '- Lis les fichiers concernés avant de les modifier ; n’invente pas de fichiers ou de fonctions qui n’existent pas.',
    '- Fais vraiment les changements avec tes outils (ne te contente pas de montrer du code dans ta réponse).',
    '- Petit changement dans un gros fichier : modifier_fichier. Nouveau fichier ou réécriture : ecrire_fichier avec le',
    '  contenu COMPLET.',
    '- Pour une page web, mets le CSS et le JavaScript dans des fichiers du projet (ou dans la page) : la personne peut',
    '  voir le résultat en direct dans le Studio.',
    '- Supprime un fichier seulement si c’est nécessaire à la demande.',
    '- Quand tout est fait, termine par un court résumé : ce que tu as changé (fichier par fichier) et comment l’essayer.',
    '',
    `PROJET : ${p.nom}`,
    p.description ? `DESCRIPTION : ${p.description}` : '',
    p.fichiers.length ? `FICHIERS AU DÉBUT (${p.fichiers.length}) :\n${arbre}` : 'Le projet ne contient encore aucun fichier.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

const ICONES: Record<EtapeAgent['type'], string> = {
  lister: '📂',
  lire: '👀',
  ecrire: '✍️',
  modifier: '✏️',
  supprimer: '🗑',
  erreur: '⚠️',
  texte: '💬',
};

const LIBELLES: Record<EtapeAgent['type'], string> = {
  lister: 'Regarde les fichiers',
  lire: 'Lit',
  ecrire: 'Écrit',
  modifier: 'Modifie',
  supprimer: 'Supprime',
  erreur: 'Erreur',
  texte: '',
};

/** Applique le résultat de l'agent au projet (en gardant la version GitHub d'origine des fichiers). */
function appliquer(proj: Projet, r: ResultatAgent): Projet {
  const maintenant = Date.now();
  const anciens = new Map(proj.fichiers.map((f) => [f.chemin, f]));
  const fichiers: Fichier[] = Object.keys(r.fichiers)
    .sort((x, y) => x.localeCompare(y))
    .map((chemin) => {
      const f = anciens.get(chemin);
      const contenu = r.fichiers[chemin];
      if (f && f.contenu === contenu) return f;
      return f ? { ...f, contenu, majLe: maintenant } : { chemin, contenu, majLe: maintenant };
    });
  const suivisGithub = r.supprimes.filter((c) => anciens.get(c)?.origine !== undefined);
  const supprimes = suivisGithub.length ? [...new Set([...(proj.supprimes ?? []), ...suivisGithub])] : proj.supprimes;
  return { ...proj, fichiers, supprimes };
}

/** Fichiers touchés par l'agent, avec leur contenu avant / après (pour les compter et les afficher). */
function listerChangements(avant: Fichier[], r: ResultatAgent): Changement[] {
  const anciens = new Map(avant.map((f) => [f.chemin, f.contenu]));
  return [
    ...r.crees.map((chemin) => ({ chemin, ancien: null, nouveau: r.fichiers[chemin] ?? '' })),
    ...r.modifies.map((chemin) => ({ chemin, ancien: anciens.get(chemin) ?? '', nouveau: r.fichiers[chemin] ?? '' })),
    ...r.supprimes.map((chemin) => ({ chemin, ancien: anciens.get(chemin) ?? '', nouveau: null })),
  ];
}

function resumeChangements(r: ResultatAgent): string {
  const lignes = [
    ...r.crees.map((c) => `- ➕ \`${c}\``),
    ...r.modifies.map((c) => `- ✏️ \`${c}\``),
    ...r.supprimes.map((c) => `- 🗑 \`${c}\``),
  ];
  return lignes.length ? `**Fichiers changés (${lignes.length}) :**\n${lignes.join('\n')}` : '_Aucun fichier changé._';
}

export function AgentCodex({
  projet: p,
  couleurs: c,
  onModifier,
}: {
  projet: Projet;
  couleurs: Couleurs;
  onModifier: (f: (p: Projet) => Projet) => void;
}) {
  const connexion = useConnexion('codex');
  const { ouvrirReglages } = useReglagesIA();
  const [saisie, setSaisie] = useState('');
  const [etapes, setEtapes] = useState<EtapeAgent[] | null>(null);
  // Version du projet avant le dernier passage de l'agent, pour pouvoir tout annuler.
  const [avant, setAvant] = useState<Pick<Projet, 'fichiers' | 'supprimes'> | null>(null);
  // Fichiers changés au dernier passage de l'agent (code en couleur, lignes ajoutées / retirées).
  const [changements, setChangements] = useState<Changement[] | null>(null);
  const controleur = useRef<AbortController | null>(null);
  const defilement = useRef<ScrollView>(null);
  const messages = p.messagesAgent ?? [];
  const occupe = etapes !== null;
  const total = changements ? totalChangements(changements) : null;

  if (connexion.fournisseur !== 'anthropic' || manqueCle(connexion)) {
    const autreIA = connexion.fournisseur !== 'anthropic';
    return (
      <View style={[styles.info, { backgroundColor: c.carte, borderColor: c.bordure }]}>
        <Text style={[styles.titreInfo, { color: c.texte }]}>🤖 Agent Claude</Text>
        <Text style={{ color: c.texte, fontSize: 15, lineHeight: 22 }}>
          En mode agent, Claude travaille tout seul dans ton projet : il lit les fichiers, les crée, les modifie et les
          supprime, puis te résume ce qu’il a fait.{'\n\n'}
          {autreIA
            ? `L’IA du Codex est actuellement « ${FOURNISSEURS[connexion.fournisseur].nom} ». Choisis « Claude (Anthropic) » et colle ta clé API Claude.`
            : 'Colle ta clé API Claude (Anthropic) dans les réglages de l’IA du Codex.'}
        </Text>
        <Pressable
          onPress={() => ouvrirReglages('codex')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={{ color: c.surAccent, fontWeight: '800' }}>Ouvrir les réglages du Codex</Text>
        </Pressable>
      </View>
    );
  }

  const envoyer = async () => {
    const demande = saisie.trim();
    if (!demande || occupe) return;
    setSaisie('');
    const historique: MessageIA[] = [...messages, { role: 'user', content: demande }];
    onModifier((proj) => ({ ...proj, messagesAgent: historique }));
    setEtapes([]);
    setChangements(null);
    const ctrl = new AbortController();
    controleur.current = ctrl;
    const fichiers: FichiersAgent = Object.fromEntries(p.fichiers.map((f) => [f.chemin, f.contenu]));
    const depart = { fichiers: p.fichiers, supprimes: p.supprimes };
    try {
      const r = await lancerAgent(connexion, {
        systeme: consigneAgent(p),
        messages: historique,
        fichiers,
        signal: ctrl.signal,
        onEtape: (e) => {
          setEtapes((l) => [...(l ?? []), e]);
          requestAnimationFrame(() => defilement.current?.scrollToEnd({ animated: true }));
        },
      });
      const changement = r.crees.length + r.modifies.length + r.supprimes.length > 0;
      const reponse = [r.texte, resumeChangements(r), r.avertissement ? `⚠️ ${r.avertissement}` : '']
        .filter(Boolean)
        .join('\n\n');
      onModifier((proj) => {
        const suivant = changement ? appliquer(proj, r) : proj;
        return { ...suivant, messagesAgent: [...historique, { role: 'assistant', content: reponse }] };
      });
      if (changement) {
        setAvant(depart);
        setChangements(listerChangements(depart.fichiers, r));
      }
    } catch (e) {
      const arret = (e as Error)?.name === 'AbortError';
      const texte = arret ? '⏹ Arrêté. Aucun fichier n’a été changé.' : `⚠️ ${(e as Error).message}\n\nAucun fichier n’a été changé.`;
      onModifier((proj) => ({ ...proj, messagesAgent: [...historique, { role: 'assistant', content: texte }] }));
    } finally {
      controleur.current = null;
      setEtapes(null);
      requestAnimationFrame(() => defilement.current?.scrollToEnd({ animated: true }));
    }
  };

  const annuler = () =>
    Alert.alert('Annuler les changements ?', 'Les fichiers reviennent comme avant le dernier travail de l’agent.', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Annuler les changements',
        style: 'destructive',
        onPress: () => {
          if (!avant) return;
          onModifier((proj) => ({
            ...proj,
            fichiers: avant.fichiers,
            supprimes: avant.supprimes,
            messagesAgent: [...(proj.messagesAgent ?? []), { role: 'assistant', content: '↩ Changements annulés.' }],
          }));
          setAvant(null);
          setChangements(null);
        },
      },
    ]);

  return (
    <View style={styles.flex}>
      <ScrollView ref={defilement} style={styles.flex} contentContainerStyle={styles.liste} keyboardShouldPersistTaps="handled">
        {messages.length === 0 && !occupe && (
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.texte, fontSize: 16, lineHeight: 23 }}>
              🤖 Décris ce que tu veux : Claude lit ton projet, écrit et modifie les fichiers lui-même, puis te résume
              ce qu’il a fait. Tu peux tout annuler après.
            </Text>
            <Text style={{ color: c.texteDoux, fontSize: 14 }}>
              IA : {connexion.modele}. Chaque étape est facturée sur ton compte Anthropic.
            </Text>
          </View>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <View key={i} style={[styles.bulleMoi, { backgroundColor: c.accent }]}>
              <Text style={{ color: c.surAccent, fontSize: 16 }}>{m.content}</Text>
            </View>
          ) : (
            <View key={i} style={[styles.bulleAgent, { backgroundColor: c.carte, borderColor: c.bordure }]}>
              <Markdown texte={m.content} couleurs={c} />
            </View>
          ),
        )}
        {occupe && (
          <View style={[styles.bulleAgent, { backgroundColor: c.carte, borderColor: c.bordure }]}>
            {etapes.map((e, i) => (
              <Text
                key={i}
                style={{ color: e.type === 'erreur' ? c.danger : e.type === 'texte' ? c.texte : c.texteDoux, fontSize: 14 }}
                numberOfLines={e.type === 'texte' ? 4 : 2}
              >
                {ICONES[e.type]} {LIBELLES[e.type]} {e.detail}
              </Text>
            ))}
            <View style={styles.enCours}>
              <ActivityIndicator color={c.accentTexte} />
              <Text style={{ color: c.texteDoux }}>Claude travaille…</Text>
            </View>
          </View>
        )}
        {changements && total && changements.length > 0 && !occupe && (
          <View style={styles.changements}>
            <Text style={[styles.titreChangements, { color: c.texte }]}>
              📝 Code écrit :{' '}
              <Text style={{ color: c.code.ajout }}>+{total.ajouts}</Text>{' '}
              <Text style={{ color: c.code.retrait }}>−{total.retraits}</Text>
              <Text style={{ color: c.texteDoux, fontWeight: '400' }}> lignes · touche un fichier pour voir le code</Text>
            </Text>
            {changements.map((ch) => (
              <CarteChangement key={ch.chemin} changement={ch} couleurs={c} />
            ))}
          </View>
        )}
        {avant && !occupe && (
          <Pressable onPress={annuler} accessibilityRole="button" style={[styles.boutonAnnuler, { borderColor: c.danger }]}>
            <Text style={{ color: c.danger, fontWeight: '700' }}>↩ Annuler les derniers changements</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.saisie, { borderColor: c.bordure }]}>
        <TextInput
          value={saisie}
          onChangeText={setSaisie}
          placeholder="Ex. : ajoute un mode sombre à la page"
          placeholderTextColor={c.texteDoux}
          multiline
          editable={!occupe}
          style={[styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }]}
          accessibilityLabel="Demande à l'agent"
        />
        {occupe ? (
          <Pressable
            onPress={() => controleur.current?.abort()}
            accessibilityRole="button"
            accessibilityLabel="Arrêter l'agent"
            style={[styles.envoyer, { backgroundColor: c.danger }]}
          >
            <Text style={styles.texteEnvoyer}>■</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={envoyer}
            disabled={!saisie.trim()}
            accessibilityRole="button"
            accessibilityLabel="Lancer l'agent"
            style={[styles.envoyer, { backgroundColor: c.accent, opacity: saisie.trim() ? 1 : 0.5 }]}
          >
            <Text style={[styles.texteEnvoyer, { color: c.surAccent }]}>➤</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  liste: { padding: 16, gap: 12 },
  info: { margin: 16, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 12 },
  titreInfo: { fontSize: 18, fontWeight: '800' },
  bouton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  bulleMoi: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bulleAgent: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  changements: { gap: 8 },
  titreChangements: { fontSize: 15, fontWeight: '800' },
  enCours: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  boutonAnnuler: { alignSelf: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  saisie: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  champ: {
    flex: 1,
    minHeight: 46,
    maxHeight: 160,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  envoyer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  texteEnvoyer: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
});
