import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { nouvelId, usePersistant } from '../hooks/usePersistant';
import { annulerRappel, programmerRappel } from '../rappels/notifications';
import type { Couleurs } from '../theme';

/** Un rendez-vous de l'agenda. */
type Rdv = {
  id: string;
  jour: string; // AAAA-MM-JJ
  heure: string; // HH:MM
  titre: string;
  /** Identifiant de la notification de rappel, si programmée. */
  rappelId?: string;
};

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const cle = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Position de lundi=0 … dimanche=6 (la semaine commence le lundi). */
const lundiEnTete = (jourJs: number) => (jourJs + 6) % 7;

function libelleJour(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(a, m - 1, j);
  return `${JOURS[d.getDay()]} ${j} ${MOIS[m - 1]}`;
}

type Props = { visible: boolean; couleurs: Couleurs; onFermer: () => void };

/** Agenda : un calendrier mensuel et les rendez-vous de chaque jour, avec rappel optionnel. */
export function EcranAgenda({ visible, couleurs: c, onFermer }: Props) {
  const [rdvs, setRdvs] = usePersistant<Rdv[]>('marceau:agenda', []);
  const aujourdhui = useMemo(() => new Date(), []);
  // Premier jour du mois affiché.
  const [mois, setMois] = useState(() => new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1));
  const [jourChoisi, setJourChoisi] = useState(cle(aujourdhui));
  const [saisie, setSaisie] = useState('');
  const [heure, setHeure] = useState('12:00');
  const [rappel, setRappel] = useState(true);

  const parJour = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rdvs) m.set(r.jour, (m.get(r.jour) ?? 0) + 1);
    return m;
  }, [rdvs]);

  const duJour = useMemo(
    () => rdvs.filter((r) => r.jour === jourChoisi).sort((a, b) => a.heure.localeCompare(b.heure)),
    [rdvs, jourChoisi],
  );

  // Cases du mois : des blancs pour aligner le 1er sous le bon jour de semaine.
  const cases = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
    const vides = lundiEnTete(premier.getDay());
    const liste: (string | null)[] = Array(vides).fill(null);
    for (let j = 1; j <= nbJours; j++) liste.push(cle(new Date(mois.getFullYear(), mois.getMonth(), j)));
    return liste;
  }, [mois]);

  const changerMois = (delta: number) => setMois((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const heureValide = (h: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(h.trim());

  const ajouter = async () => {
    const titre = saisie.trim();
    if (!titre) return;
    if (!heureValide(heure)) {
      Alert.alert('Heure invalide', 'Écris l’heure au format HH:MM, par exemple 09:30.');
      return;
    }
    const [hh, mm] = heure.trim().split(':').map(Number);
    const [a, m, j] = jourChoisi.split('-').map(Number);
    const quand = new Date(a, m - 1, j, hh, mm, 0, 0);
    let rappelId: string | null = null;
    if (rappel && quand.getTime() > Date.now()) {
      rappelId = await programmerRappel('📅 ' + titre, `C’est l’heure : ${titre} (${heure.trim()})`, quand);
      if (!rappelId) Alert.alert('Rappel non programmé', 'Autorise les notifications pour recevoir un rappel. Le rendez-vous est quand même enregistré.');
    }
    setRdvs((l) => [...l, { id: nouvelId(), jour: jourChoisi, heure: heure.trim(), titre, rappelId: rappelId ?? undefined }]);
    setSaisie('');
  };

  const supprimer = (r: Rdv) => {
    annulerRappel(r.rappelId);
    setRdvs((l) => l.filter((x) => x.id !== r.id));
  };

  const titreMois = `${MOIS[mois.getMonth()]} ${mois.getFullYear()}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer} statusBarTranslucent>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.flex, { backgroundColor: c.fond }]}>
        <View style={styles.entete}>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer l'agenda">
            <Text style={[styles.retour, { color: c.accentTexte }]}>‹</Text>
          </Pressable>
          <Text style={[styles.titre, { color: c.texte }]}>📅 Agenda</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
          {/* Sélecteur de mois */}
          <View style={styles.moisBarre}>
            <Pressable onPress={() => changerMois(-1)} hitSlop={10} accessibilityLabel="Mois précédent" style={styles.flecheMois}>
              <Text style={[styles.fleche, { color: c.accentTexte }]}>‹</Text>
            </Pressable>
            <Text style={[styles.moisTitre, { color: c.texte }]}>{titreMois}</Text>
            <Pressable onPress={() => changerMois(1)} hitSlop={10} accessibilityLabel="Mois suivant" style={styles.flecheMois}>
              <Text style={[styles.fleche, { color: c.accentTexte }]}>›</Text>
            </Pressable>
          </View>

          {/* En-têtes des jours de la semaine */}
          <View style={styles.semaine}>
            {JOURS_COURT.map((j, i) => (
              <Text key={i} style={[styles.jourSemaine, { color: c.texteDoux }]}>
                {j}
              </Text>
            ))}
          </View>

          {/* Grille du mois */}
          <View style={styles.grille}>
            {cases.map((k, i) =>
              k === null ? (
                <View key={`v${i}`} style={styles.case} />
              ) : (
                <Pressable
                  key={k}
                  onPress={() => setJourChoisi(k)}
                  accessibilityRole="button"
                  accessibilityLabel={libelleJour(k)}
                  style={styles.case}
                >
                  <View
                    style={[
                      styles.jourRond,
                      k === jourChoisi && { backgroundColor: c.accent },
                      k !== jourChoisi && k === cle(aujourdhui) && { borderColor: c.accent, borderWidth: 2 },
                    ]}
                  >
                    <Text style={{ color: k === jourChoisi ? c.surAccent : c.texte, fontWeight: '700' }}>{Number(k.split('-')[2])}</Text>
                  </View>
                  {parJour.has(k) && <View style={[styles.point, { backgroundColor: k === jourChoisi ? c.surAccent : c.accent }]} />}
                </Pressable>
              ),
            )}
          </View>

          {/* Rendez-vous du jour choisi */}
          <Text style={[styles.sousTitre, { color: c.texte }]}>{libelleJour(jourChoisi)}</Text>
          {duJour.length === 0 ? (
            <Text style={[styles.vide, { color: c.texteDoux }]}>Aucun rendez-vous ce jour-là.</Text>
          ) : (
            duJour.map((r) => (
              <View key={r.id} style={[styles.rdv, { backgroundColor: c.carte, borderColor: c.bordure }]}>
                <Text style={[styles.rdvHeure, { color: c.accentTexte }]}>{r.heure}</Text>
                <Text style={[styles.rdvTitre, { color: c.texte }]} numberOfLines={2}>
                  {r.titre}
                </Text>
                <Pressable onPress={() => supprimer(r)} hitSlop={8} accessibilityLabel="Supprimer le rendez-vous">
                  <Text style={[styles.supprimer, { color: c.danger }]}>✕</Text>
                </Pressable>
              </View>
            ))
          )}

          {/* Ajout d'un rendez-vous */}
          <View style={[styles.ajout, { backgroundColor: c.carte, borderColor: c.bordure }]}>
            <View style={styles.ligneAjout}>
              <TextInput
                value={heure}
                onChangeText={setHeure}
                placeholder="HH:MM"
                placeholderTextColor={c.texteDoux}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Heure"
                style={[styles.champHeure, { color: c.texte, borderColor: c.bordure }]}
              />
              <TextInput
                value={saisie}
                onChangeText={setSaisie}
                placeholder="Nouveau rendez-vous…"
                placeholderTextColor={c.texteDoux}
                accessibilityLabel="Titre du rendez-vous"
                style={[styles.champTitre, { color: c.texte, borderColor: c.bordure }]}
                onSubmitEditing={ajouter}
              />
            </View>
            <View style={styles.ligneRappel}>
              <Text style={{ color: c.texte, fontSize: 15 }}>🔔 Me le rappeler</Text>
              <Switch value={rappel} onValueChange={setRappel} trackColor={{ true: c.accent }} />
            </View>
            <Pressable
              onPress={ajouter}
              disabled={!saisie.trim()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.bouton, { backgroundColor: c.accent, opacity: saisie.trim() ? (pressed ? 0.8 : 1) : 0.5 }]}
            >
              <Text style={{ color: c.surAccent, fontWeight: '800' }}>Ajouter au {Number(jourChoisi.split('-')[2])} {MOIS[Number(jourChoisi.split('-')[1]) - 1]}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  retour: { fontSize: 34, fontWeight: '800', lineHeight: 34 },
  titre: { fontSize: 20, fontWeight: '800' },
  corps: { padding: 16, gap: 12 },
  moisBarre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flecheMois: { paddingHorizontal: 18, paddingVertical: 4 },
  fleche: { fontSize: 30, fontWeight: '800' },
  moisTitre: { fontSize: 19, fontWeight: '800', textTransform: 'capitalize' },
  semaine: { flexDirection: 'row' },
  jourSemaine: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  case: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  jourRond: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  point: { width: 5, height: 5, borderRadius: 2.5 },
  sousTitre: { fontSize: 17, fontWeight: '800', marginTop: 6, textTransform: 'capitalize' },
  vide: { fontSize: 15 },
  rdv: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rdvHeure: { fontSize: 15, fontWeight: '800', width: 48 },
  rdvTitre: { flex: 1, fontSize: 16 },
  supprimer: { fontSize: 18, fontWeight: '800' },
  ajout: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, gap: 12, marginTop: 4 },
  ligneAjout: { flexDirection: 'row', gap: 10 },
  champHeure: { width: 74, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: 'center' },
  champTitre: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  ligneRappel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bouton: { alignItems: 'center', paddingVertical: 13, borderRadius: 12 },
});
