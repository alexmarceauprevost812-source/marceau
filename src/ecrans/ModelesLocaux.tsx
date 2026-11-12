import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  DOSSIER_PARTAGE,
  analyserRefOllama,
  dossierPartageLisible,
  formaterTaille,
  ggufDisponible,
  importerGguf,
  listerModelesLocaux,
  nomFichierPourRef,
  supprimerModele,
  SUGGESTIONS_GGUF,
  telechargerLien,
  type ModeleLocal,
  type Progression,
} from '../ia/gguf';
import type { Couleurs } from '../theme';

type Props = {
  couleurs: Couleurs;
  /** Nom du fichier .gguf choisi pour cet espace (Chat ou Codex). */
  modeleChoisi: string;
  onChoisir: (nom: string) => void;
};

/** Choisir, télécharger (en un clic) ou ajouter des modèles .gguf qui tournent sur le téléphone. */
export function ModelesLocaux({ couleurs: c, modeleChoisi, onChoisir }: Props) {
  const [modeles, setModeles] = useState<ModeleLocal[]>([]);
  const [partageLisible, setPartageLisible] = useState(true);
  const [lien, setLien] = useState('');
  const [en, setEn] = useState<{ titre: string; progression: Progression | null } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const controleur = useRef<AbortController | null>(null);

  const rafraichir = useCallback(() => {
    setModeles(listerModelesLocaux());
    setPartageLisible(dossierPartageLisible());
  }, []);

  useEffect(() => {
    rafraichir();
    // Si on quitte l'écran pendant un téléchargement, on l'arrête proprement.
    return () => controleur.current?.abort();
  }, [rafraichir]);

  if (!ggufDisponible()) {
    return (
      <Text style={[styles.aide, { color: c.texteDoux }]}>
        Les modèles .gguf ne marchent que dans l'APK Android de Marceau, pas sur le site web.
      </Text>
    );
  }

  const present = (nom: string) => modeles.some((m) => m.nom === nom);

  const telecharger = async (texte: string, titre: string) => {
    if (en) return;
    const ctrl = new AbortController();
    controleur.current = ctrl;
    setMessage(null);
    setEn({ titre, progression: null });
    try {
      const nom = await telechargerLien(texte, {
        signal: ctrl.signal,
        onProgression: (p) => setEn({ titre, progression: p }),
      });
      rafraichir();
      onChoisir(nom);
      setLien('');
      setMessage({ ok: true, texte: `« ${nom} » est prêt et choisi. Touche « Enregistrer » pour l'utiliser.` });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') setMessage({ ok: false, texte: 'Téléchargement annulé.' });
      else setMessage({ ok: false, texte: (e as Error).message });
    } finally {
      controleur.current = null;
      setEn(null);
    }
  };

  const ajouterFichier = async () => {
    setMessage(null);
    setEn({ titre: 'Ajout du fichier…', progression: null });
    try {
      const nom = await importerGguf();
      if (nom) {
        rafraichir();
        onChoisir(nom);
        setMessage({ ok: true, texte: `« ${nom} » est ajouté et choisi. Touche « Enregistrer » pour l'utiliser.` });
      }
    } catch (e) {
      setMessage({ ok: false, texte: (e as Error).message });
    } finally {
      setEn(null);
    }
  };

  const supprimer = (m: ModeleLocal) =>
    Alert.alert('Supprimer ce modèle ?', `« ${m.nom} » (${formaterTaille(m.taille)}) sera effacé du téléphone.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          try {
            supprimerModele(m.nom);
            if (modeleChoisi === m.nom) onChoisir('');
          } catch (e) {
            setMessage({ ok: false, texte: (e as Error).message });
          }
          rafraichir();
        },
      },
    ]);

  const autoriserFichiers = async () => {
    try {
      await Linking.sendIntent('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
    } catch {
      Linking.openSettings();
    }
  };

  const pourcent =
    en?.progression && en.progression.total > 0 ? Math.min(100, Math.round((en.progression.octets / en.progression.total) * 100)) : null;
  const lienValide = lien.trim().length > 0;
  const champ = [styles.champ, { backgroundColor: c.carte, borderColor: c.bordure, color: c.texte }];

  return (
    <>
      <Text style={[styles.etiquette, { color: c.texteDoux }]}>MODÈLES SUR LE TÉLÉPHONE</Text>
      {modeles.length === 0 && (
        <Text style={[styles.aide, { color: c.texteDoux }]}>
          Aucun modèle pour le moment. Télécharge-en un en un clic ci-dessous, ou ajoute ton propre fichier .gguf.
        </Text>
      )}
      {modeles.map((m) => {
        const actif = m.nom === modeleChoisi;
        return (
          <Pressable
            key={m.nom}
            onPress={() => onChoisir(m.nom)}
            accessibilityRole="radio"
            accessibilityState={{ selected: actif }}
            style={[styles.carte, { backgroundColor: c.carte, borderColor: actif ? c.accent : c.bordure }, actif && styles.carteActive]}
          >
            <View style={[styles.radio, { borderColor: actif ? c.accent : c.texteDoux }]}>
              {actif && <View style={[styles.point, { backgroundColor: c.accent }]} />}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.nom, { color: c.texte }]} numberOfLines={1}>
                {m.nom}
              </Text>
              <Text style={{ color: c.texteDoux, fontSize: 13 }}>
                {formaterTaille(m.taille)}
                {m.partage ? ' · dossier Models' : ''}
              </Text>
            </View>
            {!m.partage && (
              <Pressable onPress={() => supprimer(m)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Supprimer ${m.nom}`}>
                <Text style={{ fontSize: 18 }}>🗑</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}

      <Text style={[styles.etiquette, { color: c.texteDoux }]}>TÉLÉCHARGER EN UN CLIC (OLLAMA)</Text>
      <Text style={[styles.aide, { color: c.texteDoux }]}>
        Les modèles pèsent de 1 à 2 Go : mieux vaut être en Wi-Fi. Reste sur cet écran pendant le téléchargement.
      </Text>
      {SUGGESTIONS_GGUF.map((s) => {
        const ref = analyserRefOllama(s.ollama);
        const dejaLa = !!ref && present(nomFichierPourRef(ref));
        return (
          <View key={s.ollama} style={[styles.carte, { backgroundColor: c.carte, borderColor: c.bordure }]}>
            <View style={styles.flex}>
              <Text style={[styles.nom, { color: c.texte }]}>{s.titre}</Text>
              <Text style={{ color: c.texteDoux, fontSize: 13 }}>
                {s.description} · {s.taille}
              </Text>
            </View>
            <Pressable
              onPress={() => (dejaLa && ref ? onChoisir(nomFichierPourRef(ref)) : telecharger(s.ollama, s.titre))}
              disabled={!!en}
              accessibilityRole="button"
              accessibilityLabel={`${dejaLa ? 'Choisir' : 'Télécharger'} ${s.titre}`}
              style={[styles.petitBouton, { backgroundColor: c.accent, opacity: en ? 0.4 : 1 }]}
            >
              <Text style={{ color: c.surAccent, fontWeight: '800', fontSize: 13 }}>{dejaLa ? 'Choisir' : 'Télécharger'}</Text>
            </Pressable>
          </View>
        );
      })}

      <Text style={[styles.etiquette, { color: c.texteDoux }]}>OU COLLE UN LIEN</Text>
      <TextInput
        value={lien}
        onChangeText={setLien}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="llama3.2:3b, lien ollama.com ou lien .gguf"
        placeholderTextColor={c.texteDoux}
        style={champ}
        accessibilityLabel="Lien du modèle"
      />
      <Text style={[styles.aide, { color: c.texteDoux }]}>
        Un nom Ollama (llama3.2:3b), une page ollama.com/library/…, ou le lien d'un fichier .gguf (Hugging Face, par exemple).
      </Text>
      <Pressable
        onPress={() => telecharger(lien, lien.trim())}
        disabled={!lienValide || !!en}
        accessibilityRole="button"
        style={[styles.bouton, { backgroundColor: c.accent, opacity: !lienValide || en ? 0.4 : 1 }]}
      >
        <Text style={[styles.texteBouton, { color: c.surAccent }]}>Télécharger ce lien</Text>
      </Pressable>

      {en && (
        <View style={[styles.carte, { backgroundColor: c.carte, borderColor: c.accent, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={styles.ligne}>
            <ActivityIndicator color={c.accentTexte} />
            <Text style={[styles.flex, { color: c.texte, fontWeight: '700' }]} numberOfLines={1}>
              {en.titre}
            </Text>
            {pourcent !== null && <Text style={{ color: c.texte, fontWeight: '700' }}>{pourcent} %</Text>}
          </View>
          <View style={[styles.barre, { backgroundColor: c.bordure }]}>
            <View style={[styles.barreRemplie, { backgroundColor: c.accent, width: `${pourcent ?? 4}%` }]} />
          </View>
          {en.progression && en.progression.total > 0 && (
            <Text style={{ color: c.texteDoux, fontSize: 13 }}>
              {formaterTaille(en.progression.octets)} sur {formaterTaille(en.progression.total)}
            </Text>
          )}
          {controleur.current && (
            <Pressable onPress={() => controleur.current?.abort()} accessibilityRole="button" style={styles.ligne}>
              <Text style={[styles.lien, { color: c.danger }]}>Annuler le téléchargement</Text>
            </Pressable>
          )}
        </View>
      )}

      {!!message && <Text style={{ color: message.ok ? c.texte : c.danger, fontSize: 14, fontWeight: '600' }}>{message.texte}</Text>}

      <Text style={[styles.etiquette, { color: c.texteDoux }]}>MODÈLES DÉJÀ SUR TON ORDINATEUR</Text>
      <Text style={[styles.aide, { color: c.texteDoux }]}>
        Un modèle .gguf déjà téléchargé sur ton ordinateur n'a pas besoin d'être retéléchargé. Deux façons de l'envoyer au
        téléphone :
      </Text>
      <Text style={[styles.aide, { color: c.texte }]}>
        1. Par câble USB : branche le téléphone, copie le fichier .gguf dans le dossier « Models » du téléphone
        {Platform.OS === 'android' ? ` (${DOSSIER_PARTAGE})` : ''}, puis touche « Actualiser la liste ».
      </Text>
      <Text style={[styles.aide, { color: c.texte }]}>
        2. Par le Wi-Fi (même réseau que l'ordinateur) : sur l'ordinateur, ouvre un terminal dans le dossier du modèle et lance
        « python3 -m http.server 8000 ». Puis ici, colle http://ADRESSE-DE-TON-ORDI:8000/nom-du-modele.gguf dans « Colle un
        lien » (l'adresse de l'ordinateur s'affiche avec « hostname -I »).
      </Text>

      <Text style={[styles.etiquette, { color: c.texteDoux }]}>AJOUTER TES PROPRES MODÈLES</Text>
      <Pressable
        onPress={ajouterFichier}
        disabled={!!en}
        accessibilityRole="button"
        style={[styles.bouton, { backgroundColor: c.carte, borderWidth: 1, borderColor: c.accent, opacity: en ? 0.4 : 1, marginTop: 0 }]}
      >
        <Text style={{ color: c.accentTexte, fontWeight: '800' }}>📂 Ajouter un fichier .gguf</Text>
      </Pressable>
      {Platform.OS === 'android' && (
        <>
          <Text style={[styles.aide, { color: c.texteDoux }]}>
            Ou dépose tes fichiers .gguf dans le dossier « Models » du téléphone ({DOSSIER_PARTAGE}) : ils apparaissent ici
            tout seuls, sans doubler l'espace. C'est le même dossier que pour CodexLocal et le terminal LexOS.
          </Text>
          {!partageLisible && (
            <Pressable onPress={autoriserFichiers} accessibilityRole="button" style={[styles.boutonCle, { borderColor: c.accent }]}>
              <Text style={[styles.lien, { color: c.accentTexte }]}>Autoriser l'accès à tous les fichiers →</Text>
            </Pressable>
          )}
          <Pressable onPress={rafraichir} accessibilityRole="button" style={styles.ligne}>
            <Text style={[styles.lien, { color: c.accentTexte }]}>Actualiser la liste</Text>
          </Pressable>
        </>
      )}
      <Text style={[styles.aide, { color: c.texteDoux }]}>
        Le modèle tourne sur le processeur du téléphone, sans internet. Un petit modèle (1B à 3B) répond plus vite. Il ne lit pas
        les images pour le moment. Dans le Codex, il répond comme dans le chat : le mode agent reste réservé à Claude.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  aide: { fontSize: 14, lineHeight: 20 },
  etiquette: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 14 },
  champ: { minHeight: 48, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 16 },
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  carteActive: { borderWidth: 2, padding: 13 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  point: { width: 10, height: 10, borderRadius: 5 },
  nom: { fontSize: 15, fontWeight: '700' },
  petitBouton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  bouton: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  texteBouton: { fontSize: 16, fontWeight: '700' },
  boutonCle: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  lien: { fontSize: 15, fontWeight: '600' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  barre: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barreRemplie: { height: 8, borderRadius: 4 },
});
