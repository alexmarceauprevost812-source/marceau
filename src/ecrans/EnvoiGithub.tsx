import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { discuter } from '../ia/client';
import { manqueCle } from '../ia/fournisseurs';
import { changementsDuProjet, creerDepot, envoyerSurGithub, projetSynchronise, type Changement } from '../ia/github';
import { useConnexion, useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';
import type { Projet } from '../types';
import { statsDiff } from '../ui/diff';
import { POLICE_CODE } from '../ui/police';
import { VueDiff } from '../ui/VueDiff';

type Props = {
  projet: Projet | null;
  couleurs: Couleurs;
  onFermer: () => void;
  onSynchronise: (p: Projet) => void;
};

function nomDepot(nom: string) {
  return (
    nom
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'mon-projet'
  );
}

/** Envoyer les changements du projet sur GitHub (commit + push), ou publier un nouveau dépôt. */
export function EnvoiGithub({ projet: p, couleurs: c, onFermer, onSynchronise }: Props) {
  const { reglages, ouvrirReglages } = useReglagesIA();
  const connexion = useConnexion('codex');
  const jeton = reglages.jetonGithub;
  const [message, setMessage] = useState('');
  const [nouvelleBranche, setNouvelleBranche] = useState(false);
  const [branche, setBranche] = useState('');
  const [depot, setDepot] = useState('');
  const [prive, setPrive] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState<{ texte: string; url: string } | null>(null);

  useEffect(() => {
    if (p) {
      setMessage('');
      setNouvelleBranche(false);
      setBranche('');
      setDepot(nomDepot(p.nom));
      setErreur('');
      setSucces(null);
      setOuvert(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  if (!p) return null;

  const relie = !!p.github;
  const changements: Changement[] = relie
    ? changementsDuProjet(p)
    : p.fichiers.map((f) => ({ chemin: f.chemin, etat: 'ajoute', contenu: f.contenu }));

  const ecrireMessage = async () => {
    if (manqueCle(connexion)) {
      setErreur('Ajoute une clé API pour que l’IA écrive le message.');
      return;
    }
    setEnCours('L’IA écrit le message…');
    setErreur('');
    try {
      const resume = changements
        .map((ch) => {
          const f = p.fichiers.find((x) => x.chemin === ch.chemin);
          const s = ch.etat === 'modifie' && f?.origine !== undefined ? statsDiff(f.origine, f.contenu) : null;
          return `- ${ch.etat} ${ch.chemin}${s ? ` (+${s.ajouts} −${s.retraits})` : ''}`;
        })
        .join('\n');
      const texte = await discuter(connexion, {
        systeme:
          'Écris un message de commit Git en français : une première ligne courte (moins de 60 caractères) à l’impératif, ' +
          'puis au besoin une ligne vide et 1 à 3 puces. Réponds UNIQUEMENT avec le message, sans guillemets ni bloc de code.',
        messages: [{ role: 'user', content: `Changements :\n${resume}` }],
        maxTokens: 300,
      });
      setMessage(texte.replace(/^```\w*\n?|```$/g, '').trim());
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(null);
    }
  };

  const envoyer = async () => {
    setErreur('');
    setSucces(null);
    try {
      if (relie) {
        const lien = p.github!;
        const cible = nouvelleBranche ? branche.trim() : lien.branche;
        if (!cible) throw new Error('Donne un nom à la nouvelle branche.');
        setEnCours('Envoi sur GitHub…');
        const r = await envoyerSurGithub({
          jeton,
          proprio: lien.proprio,
          depot: lien.depot,
          branche: cible,
          brancheDepart: lien.branche,
          message: message || 'Mise à jour depuis Marceau Codex',
          changements,
        });
        onSynchronise(projetSynchronise(p, { ...lien, branche: cible, commit: r.commit }));
        setSucces({
          texte: `${changements.length} fichier${changements.length > 1 ? 's' : ''} envoyé${changements.length > 1 ? 's' : ''} sur ${lien.proprio}/${lien.depot} (${cible})${r.brancheCreee ? ', nouvelle branche créée' : ''} ✓`,
          url: r.url,
        });
      } else {
        if (!depot.trim()) throw new Error('Donne un nom au dépôt.');
        setEnCours('Création du dépôt…');
        const d = await creerDepot(jeton, depot.trim(), p.description, prive);
        setEnCours('Envoi des fichiers…');
        const r = await envoyerSurGithub({
          jeton,
          proprio: d.proprio,
          depot: d.depot,
          branche: d.branche,
          message: message || 'Premier envoi depuis Marceau Codex',
          changements,
        });
        onSynchronise(projetSynchronise(p, { ...d, commit: r.commit }));
        setSucces({ texte: `Dépôt ${d.proprio}/${d.depot} créé avec ${changements.length} fichiers ✓`, url: `https://github.com/${d.proprio}/${d.depot}` });
      }
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnCours(null);
    }
  };

  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];
  const peutEnvoyer = !!jeton.trim() && changements.length > 0 && !enCours && !succes;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onFermer}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.fond }]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.barre}>
            <Pressable onPress={onFermer} hitSlop={12}>
              <Text style={[styles.lien, { color: c.accentTexte }]}>Fermer</Text>
            </Pressable>
            <Text style={[styles.titreBarre, { color: c.texte }]}>{relie ? '⬆ Envoyer sur GitHub' : 'Publier sur GitHub'}</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
            {!jeton.trim() && (
              <Pressable
                onPress={() => {
                  onFermer();
                  ouvrirReglages('codex');
                }}
                style={[styles.alerte, { borderColor: c.danger }]}
              >
                <Text style={{ color: c.danger, fontWeight: '700', lineHeight: 20 }}>
                  Ajoute ton jeton GitHub dans Réglages IA → Codex pour écrire sur GitHub →
                </Text>
              </Pressable>
            )}

            <View style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
              {relie ? (
                <>
                  <Text style={[styles.depot, { color: c.texte }]}>
                    {p.github!.proprio}/{p.github!.depot}
                  </Text>
                  <Text style={{ color: c.texteDoux, fontSize: 13 }}>
                    Branche : {p.github!.branche} · dernier commit {p.github!.commit.slice(0, 7)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.etiquette, { color: c.texteDoux, marginTop: 0 }]}>NOM DU NOUVEAU DÉPÔT</Text>
                  <TextInput value={depot} onChangeText={setDepot} autoCapitalize="none" autoCorrect={false} style={champ} />
                  <View style={styles.ligneSwitch}>
                    <Text style={{ color: c.texte, fontSize: 15 }}>Dépôt privé</Text>
                    <Switch value={prive} onValueChange={setPrive} trackColor={{ true: c.accent, false: c.bordure }} />
                  </View>
                </>
              )}
            </View>

            <Text style={[styles.etiquette, { color: c.texteDoux }]}>
              {changements.length} CHANGEMENT{changements.length > 1 ? 'S' : ''}
            </Text>
            {changements.length === 0 && (
              <Text style={{ color: c.texteDoux, fontSize: 14 }}>Rien à envoyer : le projet est à jour avec GitHub.</Text>
            )}
            <View style={[styles.cadre, { borderColor: c.bordure, backgroundColor: c.carte }]}>
              {changements.map((ch) => {
                const f = p.fichiers.find((x) => x.chemin === ch.chemin);
                const s = ch.etat === 'modifie' && f?.origine !== undefined ? statsDiff(f.origine, f.contenu) : null;
                const lettre = ch.etat === 'ajoute' ? 'A' : ch.etat === 'modifie' ? 'M' : 'S';
                const couleur = ch.etat === 'supprime' ? c.code.retrait : ch.etat === 'ajoute' ? c.code.ajout : c.accentTexte;
                const estOuvert = ouvert === ch.chemin;
                return (
                  <View key={ch.chemin}>
                    <Pressable
                      onPress={() => setOuvert(estOuvert ? null : ch.chemin)}
                      disabled={ch.etat !== 'modifie'}
                      style={styles.ligneChangement}
                    >
                      <Text style={[styles.lettre, { color: couleur }]}>{lettre}</Text>
                      <Text numberOfLines={1} style={[styles.chemin, { color: c.texte }]}>
                        {ch.chemin}
                      </Text>
                      {s && (
                        <Text style={{ fontSize: 12, fontWeight: '800' }}>
                          <Text style={{ color: c.code.ajout }}>+{s.ajouts} </Text>
                          <Text style={{ color: c.code.retrait }}>−{s.retraits}</Text>
                        </Text>
                      )}
                      {ch.etat === 'modifie' && <Text style={{ color: c.accentTexte }}>{estOuvert ? '▾' : '▸'}</Text>}
                    </Pressable>
                    {estOuvert && f?.origine !== undefined && <VueDiff ancien={f.origine} nouveau={f.contenu} couleurs={c} />}
                  </View>
                );
              })}
            </View>

            <View style={styles.ligneEtiquette}>
              <Text style={[styles.etiquette, { color: c.texteDoux }]}>MESSAGE DU COMMIT</Text>
              <Pressable onPress={ecrireMessage} disabled={!!enCours || !changements.length} hitSlop={8}>
                <Text style={[styles.lien, { color: c.accentTexte, fontSize: 13 }]}>✨ Écrire avec l’IA</Text>
              </Pressable>
            </View>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder={relie ? 'Mise à jour depuis Marceau Codex' : 'Premier envoi depuis Marceau Codex'}
              placeholderTextColor={c.texteDoux}
              multiline
              style={[...champ, { minHeight: 70, paddingTop: 12, textAlignVertical: 'top' }]}
            />

            {relie && (
              <>
                <View style={styles.ligneSwitch}>
                  <Text style={{ color: c.texte, fontSize: 15, flex: 1 }}>Envoyer sur une nouvelle branche</Text>
                  <Switch
                    value={nouvelleBranche}
                    onValueChange={setNouvelleBranche}
                    trackColor={{ true: c.accent, false: c.bordure }}
                  />
                </View>
                {nouvelleBranche && (
                  <TextInput
                    value={branche}
                    onChangeText={setBranche}
                    placeholder="ex. correction-bug-menu"
                    placeholderTextColor={c.texteDoux}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={champ}
                  />
                )}
              </>
            )}

            {!!erreur && <Text style={{ color: c.danger, fontSize: 14, lineHeight: 20 }}>{erreur}</Text>}
            {!!enCours && (
              <View style={styles.ligneEtiquette}>
                <ActivityIndicator color={c.accentTexte} />
                <Text style={{ color: c.texte, flex: 1 }}>{enCours}</Text>
              </View>
            )}
            {succes && (
              <View style={[styles.carte, { borderColor: c.accent, backgroundColor: c.carte }]}>
                <Text style={{ color: c.texte, fontWeight: '700', lineHeight: 20 }}>{succes.texte}</Text>
                <Pressable onPress={() => Linking.openURL(succes.url)}>
                  <Text style={[styles.lien, { color: c.accentTexte, marginTop: 6 }]}>Voir sur GitHub →</Text>
                </Pressable>
              </View>
            )}

            <Pressable
              onPress={envoyer}
              disabled={!peutEnvoyer}
              style={[styles.bouton, { backgroundColor: c.accent, opacity: peutEnvoyer ? 1 : 0.4 }]}
            >
              <Text style={[styles.texteBouton, { color: c.surAccent }]}>
                {relie ? '⬆ Commit et push' : 'Créer le dépôt et envoyer'}
              </Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  barre: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  titreBarre: { fontSize: 17, fontWeight: '800' },
  lien: { fontSize: 15, fontWeight: '700' },
  contenu: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  alerte: { borderWidth: 1.5, borderRadius: 12, padding: 12 },
  carte: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 14, gap: 6 },
  depot: { fontSize: 17, fontWeight: '800', fontFamily: POLICE_CODE },
  etiquette: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 8 },
  ligneEtiquette: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cadre: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  ligneChangement: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  lettre: { fontWeight: '900', width: 14, fontFamily: POLICE_CODE },
  chemin: { flex: 1, fontFamily: POLICE_CODE, fontSize: 14 },
  champ: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  ligneSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  bouton: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  texteBouton: { fontSize: 16, fontWeight: '800' },
});
