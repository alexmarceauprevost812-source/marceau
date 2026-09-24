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
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listerModeles } from '../ia/client';
import { utilisateurGithub } from '../ia/github';
import { ConnexionGithub } from './ConnexionGithub';
import { FOURNISSEURS, ORDRE_FOURNISSEURS, type Espace, type IdFournisseur, type ReglagesIA } from '../ia/fournisseurs';
import { useReglagesIA } from '../ia/ReglagesContexte';
import type { Couleurs } from '../theme';

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void; espaceInitial?: Espace };

/** Choix du fournisseur d'IA, du modèle et des clés API. */
export function EcranReglages({ visible, couleurs: c, onFermer, espaceInitial = 'chat' }: Props) {
  const { reglages, enregistrer } = useReglagesIA();
  const [brouillon, setBrouillon] = useState<ReglagesIA>(reglages);
  const [modeles, setModeles] = useState<string[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [message, setMessage] = useState('');
  const [espace, setEspace] = useState<Espace>(espaceInitial);
  const [testGithub, setTestGithub] = useState<{ ok: boolean; texte: string } | null>(null);
  const [connexionGithub, setConnexionGithub] = useState(false);
  const [testEnCours, setTestEnCours] = useState(false);

  useEffect(() => {
    if (visible) {
      setBrouillon(reglages);
      setModeles(null);
      setMessage('');
      setEspace(espaceInitial);
      setTestGithub(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const id = espace === 'codex' ? brouillon.actifCodex : brouillon.actif;
  const f = FOURNISSEURS[id];
  const config = brouillon.configs[id];

  const changer = (champ: 'url' | 'modele' | 'cle', valeur: string) =>
    setBrouillon({ ...brouillon, configs: { ...brouillon.configs, [id]: { ...config, [champ]: valeur } } });

  const choisir = (nouveau: IdFournisseur) => {
    setBrouillon(espace === 'codex' ? { ...brouillon, actifCodex: nouveau } : { ...brouillon, actif: nouveau });
    setModeles(null);
    setMessage('');
  };

  const charger = async () => {
    setChargement(true);
    setMessage('');
    try {
      const liste = await listerModeles({ fournisseur: id, ...config });
      setModeles(liste);
      if (!liste.length) setMessage('Aucun modèle trouvé sur ce serveur.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setChargement(false);
    }
  };

  const testerGithub = async () => {
    setTestEnCours(true);
    setTestGithub(null);
    try {
      const login = await utilisateurGithub(brouillon.jetonGithub);
      setTestGithub({ ok: true, texte: `Connecté à GitHub : ${login} ✓` });
    } catch (e) {
      setTestGithub({ ok: false, texte: (e as Error).message });
    } finally {
      setTestEnCours(false);
    }
  };

  const sauver = async () => {
    await enregistrer(brouillon);
    onFermer();
  };

  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];
  const listeModeles = modeles ?? f.modelesSuggeres;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onFermer}>
      <SafeAreaView style={[styles.ecran, { backgroundColor: c.fond }]}>
        <KeyboardAvoidingView style={styles.ecran} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.barre}>
            <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.lien, { color: c.accentTexte }]}>Annuler</Text>
            </Pressable>
            <Text style={[styles.titreBarre, { color: c.texte }]}>Réglages IA</Text>
            <Pressable onPress={sauver} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.lien, { color: c.accentTexte }]}>Enregistrer</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
            <View style={[styles.segments, { borderColor: c.bordure }]}>
              {(['chat', 'codex'] as const).map((e) => {
                const actif = espace === e;
                return (
                  <Pressable
                    key={e}
                    onPress={() => {
                      setEspace(e);
                      setModeles(null);
                      setMessage('');
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: actif }}
                    style={[styles.segment, actif && { backgroundColor: c.accent }]}
                  >
                    <Text style={{ color: actif ? c.surAccent : c.texte, fontWeight: '700' }}>
                      {e === 'chat' ? '💬 Chat et tâches' : '</> Codex'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.etiquette, { color: c.texteDoux }]}>
              IA UTILISÉE {espace === 'codex' ? 'PAR LE CODEX' : 'PAR LE CHAT'}
            </Text>
            {ORDRE_FOURNISSEURS.map((cle) => {
              const four = FOURNISSEURS[cle];
              const actif = cle === id;
              const pret = !four.besoinCle || !!brouillon.configs[cle].cle.trim();
              return (
                <Pressable
                  key={cle}
                  onPress={() => choisir(cle)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                  style={[
                    styles.option,
                    { backgroundColor: c.carte, borderColor: actif ? c.accent : c.bordure },
                    actif && styles.optionActive,
                  ]}
                >
                  <View style={[styles.radio, { borderColor: actif ? c.accent : c.texteDoux }]}>
                    {actif && <View style={[styles.point, { backgroundColor: c.accent }]} />}
                  </View>
                  <View style={styles.flex}>
                    <Text style={[styles.nomOption, { color: c.texte }]}>{four.nom}</Text>
                    <Text style={{ color: c.texteDoux, fontSize: 13 }}>
                      {four.gratuit ? 'Gratuit' : 'Ta clé API'} · {pret ? 'prêt' : 'clé à ajouter'}
                    </Text>
                  </View>
                  {four.gratuit && (
                    <View style={[styles.badge, { backgroundColor: c.accent }]}>
                      <Text style={{ color: c.surAccent, fontSize: 11, fontWeight: '800' }}>GRATUIT</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            <Text style={[styles.aide, { color: c.texteDoux }]}>{f.description}</Text>

            {f.besoinCle && (
              <>
                <Text style={[styles.etiquette, { color: c.texteDoux }]}>CLÉ API {f.gratuit ? '(GRATUITE)' : ''}</Text>
                <TextInput
                  value={config.cle}
                  onChangeText={(v) => changer('cle', v)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="Colle ta clé ici"
                  placeholderTextColor={c.texteDoux}
                  style={champ}
                  accessibilityLabel="Clé API"
                />
                {f.lienCle && (
                  <Pressable onPress={() => Linking.openURL(f.lienCle!)} accessibilityRole="link">
                    <Text style={[styles.lien, { color: c.accentTexte }]}>Obtenir une clé →</Text>
                  </Pressable>
                )}
                <Text style={[styles.aide, { color: c.texteDoux }]}>
                  Chaque clé reste dans le coffre sécurisé de ton téléphone.
                </Text>
              </>
            )}

            <Text style={[styles.etiquette, { color: c.texteDoux }]}>MODÈLE</Text>
            <TextInput
              value={config.modele}
              onChangeText={(v) => changer('modele', v)}
              autoCapitalize="none"
              autoCorrect={false}
              style={champ}
              accessibilityLabel="Modèle"
            />
            <View style={styles.puces}>
              {listeModeles.map((m) => {
                const actif = m === config.modele;
                return (
                  <Pressable
                    key={m}
                    onPress={() => changer('modele', m)}
                    style={[
                      styles.puce,
                      { borderColor: actif ? c.accent : c.bordure },
                      actif && { backgroundColor: c.accent },
                    ]}
                  >
                    <Text style={{ color: actif ? c.surAccent : c.texte, fontSize: 13 }}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={charger} disabled={chargement} accessibilityRole="button" style={styles.ligneLien}>
              {chargement && <ActivityIndicator color={c.accentTexte} />}
              <Text style={[styles.lien, { color: c.accentTexte }]}>Charger la liste des modèles du serveur</Text>
            </Pressable>
            {!!message && <Text style={{ color: c.danger, fontSize: 14 }}>{message}</Text>}

            <Text style={[styles.etiquette, { color: c.texteDoux }]}>ADRESSE DU SERVEUR</Text>
            <TextInput
              value={config.url}
              onChangeText={(v) => changer('url', v)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={champ}
              accessibilityLabel="Adresse du serveur"
            />

            {espace === 'codex' && (
              <>
                <Text style={[styles.etiquette, { color: c.texteDoux }]}>GITHUB (LIRE ET ÉCRIRE TES PROJETS)</Text>
                <Pressable
                  onPress={() => setConnexionGithub(true)}
                  accessibilityRole="button"
                  style={[styles.bouton, { backgroundColor: c.carte, borderWidth: 1, borderColor: c.accent }]}
                >
                  <Text style={{ color: c.accentTexte, fontWeight: '800' }}>🐙 Se connecter avec GitHub</Text>
                </Pressable>
                <ConnexionGithub
                  visible={connexionGithub}
                  couleurs={c}
                  onFermer={() => setConnexionGithub(false)}
                  onConnecte={async (jeton, login) => {
                    // On n'enregistre que le jeton (sur les réglages déjà validés) : les autres
                    // modifications du brouillon restent annulables avec « Annuler ».
                    setBrouillon((b) => ({ ...b, jetonGithub: jeton }));
                    await enregistrer({ ...reglages, jetonGithub: jeton });
                    setTestGithub({ ok: true, texte: `Connecté à GitHub : ${login} ✓` });
                    setConnexionGithub(false);
                  }}
                />
                <Text style={[styles.aide, { color: c.texteDoux }]}>Ou colle un jeton GitHub :</Text>
                <TextInput
                  value={brouillon.jetonGithub}
                  onChangeText={(v) => {
                    setBrouillon({ ...brouillon, jetonGithub: v });
                    setTestGithub(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  placeholder="ghp_… ou github_pat_…"
                  placeholderTextColor={c.texteDoux}
                  style={champ}
                  accessibilityLabel="Jeton GitHub"
                />
                <View style={styles.ligneLien}>
                  <Pressable
                    onPress={testerGithub}
                    disabled={!brouillon.jetonGithub.trim() || testEnCours}
                    accessibilityRole="button"
                    style={styles.ligneLien}
                  >
                    {testEnCours && <ActivityIndicator color={c.accentTexte} />}
                    <Text style={[styles.lien, { color: c.accentTexte, opacity: brouillon.jetonGithub.trim() ? 1 : 0.5 }]}>
                      Tester le jeton
                    </Text>
                  </Pressable>
                  <Text style={{ color: c.texteDoux }}>·</Text>
                  <Pressable
                    onPress={() => Linking.openURL('https://github.com/settings/tokens/new?scopes=repo&description=Marceau%20Codex')}
                    accessibilityRole="link"
                  >
                    <Text style={[styles.lien, { color: c.accentTexte }]}>Créer un jeton →</Text>
                  </Pressable>
                </View>
                {testGithub && (
                  <Text style={{ color: testGithub.ok ? c.texte : c.danger, fontSize: 14, fontWeight: '600' }}>
                    {testGithub.texte}
                  </Text>
                )}
                <Text style={[styles.aide, { color: c.texteDoux }]}>
                  Avec ce jeton, le Codex voit tes dépôts (même privés), les lit au complet et envoie tes changements
                  (commit + push). Crée un jeton « classic » avec la case « repo », ou un jeton « fine-grained » avec
                  « Contents : Read and write ». Il reste dans le coffre sécurisé du téléphone.
                </Text>
              </>
            )}

            <Pressable onPress={sauver} accessibilityRole="button" style={[styles.bouton, { backgroundColor: c.accent }]}>
              <Text style={[styles.texteBouton, { color: c.surAccent }]}>Enregistrer</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1 },
  segments: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, marginTop: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 999 },
  flex: { flex: 1 },
  barre: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  titreBarre: { fontSize: 17, fontWeight: '700' },
  lien: { fontSize: 15, fontWeight: '600' },
  ligneLien: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  contenu: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  aide: { fontSize: 14, lineHeight: 20 },
  etiquette: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 14 },
  champ: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionActive: { borderWidth: 2, padding: 13 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  point: { width: 10, height: 10, borderRadius: 5 },
  nomOption: { fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  bouton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  texteBouton: { fontSize: 16, fontWeight: '700' },
});
