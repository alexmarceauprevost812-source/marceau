// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Couleurs } from '../theme';

/**
 * Une étape d'un guide : la commande à lancer, ce qu'elle fait, et ce que ça t'apprend pour
 * mieux te protéger. Le but est éducatif et DÉFENSIF : on comprend comment ça marche sur SES
 * propres appareils/réseaux, justement pour savoir s'en protéger.
 *
 * `cible: true` = la commande contient une adresse d'exemple (IP, site) à remplacer par la tienne.
 * Dans ce cas, « Lancer » la TAPE dans le terminal SANS appuyer sur Entrée : tu remplaces l'adresse
 * puis tu appuies toi-même sur Entrée.
 */
type Etape = { commande: string; quoi: string; pourquoi: string; cible?: boolean };

/** Un guide : un objectif, et les étapes à suivre une par une pour y arriver. */
type Guide = { id: string; icone: string; titre: string; but: string; etapes: Etape[] };

/**
 * Guides pas à pas. Chaque guide reste sur TES appareils/réseaux et sert à apprendre à te
 * protéger. Rien d'automatique ni de « clé en main » contre autrui : chaque étape s'explique.
 */
const GUIDES: Guide[] = [
  {
    id: 'reseau',
    icone: '🌐',
    titre: 'Découvrir MON réseau',
    but: 'Voir quels appareils sont connectés à ton réseau et quels « ports » sont ouverts, pour repérer ce qui traîne et le fermer.',
    etapes: [
      { commande: 'apt install -y nmap', quoi: 'Installe nmap, l’outil qui explore un réseau.', pourquoi: 'C’est l’outil de base pour voir ce qui est visible sur ton réseau.' },
      { commande: 'ip addr', quoi: 'Affiche l’adresse IP de ton appareil (ex. 192.168.1.23).', pourquoi: 'Tu en déduis la plage de ton réseau (ex. 192.168.1.0/24) pour l’étape suivante.' },
      { commande: 'nmap -sn 192.168.1.0/24', quoi: 'Liste les appareils allumés sur ton réseau.', pourquoi: 'Tu vois tout ce qui est connecté chez toi — un appareil inconnu peut être suspect.', cible: true },
      { commande: 'nmap 192.168.1.1', quoi: 'Regarde les ports ouverts de ta box/routeur.', pourquoi: 'Un port ouvert inutile = une porte d’entrée. Tu sais quoi fermer dans ta box.', cible: true },
    ],
  },
  {
    id: 'ecoute',
    icone: '🔒',
    titre: 'Ce qui écoute sur MON appareil',
    but: 'Voir quels programmes de ton propre appareil « écoutent » le réseau, pour couper ceux dont tu n’as pas besoin.',
    etapes: [
      { commande: 'apt install -y iproute2', quoi: 'Installe l’outil « ss » qui liste les connexions.', pourquoi: 'Voir ce qui écoute est la première étape pour réduire sa surface d’attaque.' },
      { commande: 'ss -tulnp', quoi: 'Liste les ports en écoute (services qui attendent une connexion).', pourquoi: 'Chaque service en écoute est une porte : moins il y en a, plus tu es protégé.' },
    ],
  },
  {
    id: 'web',
    icone: '🕸️',
    titre: 'Regarder un site (le tien)',
    but: 'Comprendre ce qu’un site révèle sur lui-même (serveur, technologies), pour mieux configurer le tien.',
    etapes: [
      { commande: 'apt install -y curl whatweb', quoi: 'Installe curl et whatweb.', pourquoi: 'Ce sont les outils pour inspecter un site sans rien casser.' },
      { commande: 'curl -I https://example.com', quoi: 'Affiche les en-têtes HTTP d’un site.', pourquoi: 'Les en-têtes révèlent le serveur et des réglages de sécurité manquants à corriger.', cible: true },
      { commande: 'whatweb https://example.com', quoi: 'Devine les technologies utilisées par un site.', pourquoi: 'Savoir ce que ton site expose t’aide à cacher les infos inutiles aux attaquants.', cible: true },
    ],
  },
  {
    id: 'motdepasse',
    icone: '🔑',
    titre: 'Comprendre un mot de passe',
    but: 'Voir concrètement pourquoi un mot de passe court est faible, sur un exemple à toi, pour en choisir de solides.',
    etapes: [
      { commande: 'apt install -y john', quoi: 'Installe John the Ripper (démonstration sur TES propres exemples).', pourquoi: 'Comprendre comment un mot de passe se « casse » aide à en choisir de robustes.' },
      { commande: 'echo -n "1234" | md5sum', quoi: 'Transforme un mot de passe d’exemple en empreinte (hash).', pourquoi: 'Tu vois qu’un mot de passe court donne toujours la même empreinte, facile à retrouver.' },
      { commande: 'echo "Choisis des phrases longues : 4 mots au hasard valent mieux qu un mot compliqué."', quoi: 'Le vrai conseil de protection.', pourquoi: 'Une longue phrase de passe est bien plus dure à casser qu’un mot court « compliqué ».' },
    ],
  },
  {
    id: 'python',
    icone: '💻',
    titre: 'Mon premier script Python',
    but: 'Écrire et lancer un petit programme, pour commencer à automatiser tes propres outils.',
    etapes: [
      { commande: 'apt install -y python3', quoi: 'Installe Python 3.', pourquoi: 'Python est le langage le plus utilisé pour les outils de sécurité.' },
      { commande: 'echo \'print("Bonjour Kali !")\' > bonjour.py', quoi: 'Crée un fichier de programme.', pourquoi: 'Tu apprends à écrire un fichier de code, la base de tout.' },
      { commande: 'python3 bonjour.py', quoi: 'Lance ton programme.', pourquoi: 'Tu vois ton premier programme s’exécuter — la porte vers l’automatisation.' },
    ],
  },
];

type Props = {
  visible: boolean;
  couleurs: Couleurs;
  /** Guide ouvert (son id) ou null pour la liste. Géré par le parent pour garder la progression. */
  guideId: string | null;
  /** Étape en cours dans le guide ouvert. Gérée par le parent pour la même raison. */
  etape: number;
  onGuide: (id: string | null) => void;
  onEtape: (n: number) => void;
  onFermer: () => void;
  /**
   * Lance une commande dans le terminal Linux. `executer` vrai = tape la commande PUIS Entrée ;
   * faux = la tape seulement (pour que la personne remplace une adresse d'exemple avant d'valider).
   */
  onLancer: (commande: string, executer: boolean) => void;
};

/**
 * Guide pas à pas : panneau qui glisse depuis la DROITE. On choisit un objectif, puis on avance
 * étape par étape ; chaque étape explique la commande et ce qu’elle t’apprend pour te protéger.
 * Quand on lance une commande, le panneau se ferme pour laisser voir le terminal ; la progression
 * est conservée (elle vit dans le parent), donc on reprend au même endroit en rouvrant.
 */
export function GuidePasAPas({ visible, couleurs: c, guideId, etape, onGuide, onEtape, onFermer, onLancer }: Props) {
  const { width } = useWindowDimensions();
  const largeur = Math.min(360, width * 0.9);
  const anim = useRef(new Animated.Value(0)).current;
  const [monte, setMonte] = useState(visible);

  useEffect(() => {
    if (visible) setMonte(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setMonte(false);
    });
  }, [visible, anim]);

  if (!monte) return null;

  const guide = GUIDES.find((g) => g.id === guideId) ?? null;
  const etapeSure = guide ? Math.min(etape, guide.etapes.length - 1) : 0;

  // Lance l'étape : si elle contient une adresse d'exemple, on la tape sans Entrée (à modifier) ;
  // sinon on l'exécute directement. Dans les deux cas on ferme le panneau pour voir le terminal.
  const lancer = (e: Etape) => {
    onLancer(e.commande, !e.cible);
    onFermer();
  };

  return (
    <Modal transparent visible animationType="none" onRequestClose={onFermer} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.voile, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFermer} accessibilityLabel="Fermer le guide" />
      </Animated.View>
      <Animated.View
        style={[
          styles.panneau,
          {
            width: largeur,
            backgroundColor: c.fond,
            borderColor: c.bordure,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [largeur, 0] }) }],
          },
        ]}
      >
        <SafeAreaView edges={['top', 'bottom', 'right']} style={styles.flex}>
          <View style={[styles.entete, { borderColor: c.bordure }]}>
            {guide ? (
              <Pressable onPress={() => onGuide(null)} hitSlop={12} accessibilityRole="button">
                <Text style={[styles.lien, { color: c.accentTexte }]}>‹ Guides</Text>
              </Pressable>
            ) : (
              <View style={{ width: 60 }} />
            )}
            <Text numberOfLines={1} style={[styles.titre, { color: c.texte }]}>
              🧭 Guide pas à pas
            </Text>
            <Pressable onPress={onFermer} hitSlop={12} accessibilityRole="button">
              <Text style={[styles.lien, { color: c.accentTexte }]}>Fermer</Text>
            </Pressable>
          </View>

          {!guide ? (
            <ScrollView contentContainerStyle={styles.corps}>
              <Text style={[styles.intro, { color: c.texteDoux }]}>
                Choisis un objectif. Chaque guide t’explique les commandes une par une, dans l’ordre, pour ne plus
                être perdu. Tout se fait sur TES appareils et réseaux, pour apprendre à te protéger.
              </Text>
              {GUIDES.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    onGuide(g.id);
                    onEtape(0);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.carte, { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.carteTitre, { color: c.texte }]}>
                    {g.icone} {g.titre}
                  </Text>
                  <Text style={[styles.carteBut, { color: c.texteDoux }]}>{g.but}</Text>
                  <Text style={[styles.carteEtapes, { color: c.accentTexte }]}>
                    {g.etapes.length} étape{g.etapes.length > 1 ? 's' : ''} ›
                  </Text>
                </Pressable>
              ))}
              <Text style={[styles.pied, { color: c.texteDoux }]}>
                ⚖️ Sers-toi de ces commandes uniquement sur tes propres appareils et réseaux, ou avec une
                autorisation écrite.
              </Text>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.corps}>
              <Text style={[styles.guideTitre, { color: c.texte }]}>
                {guide.icone} {guide.titre}
              </Text>
              <Text style={[styles.progression, { color: c.accentTexte }]}>
                Étape {etapeSure + 1} sur {guide.etapes.length}
              </Text>

              <View style={[styles.etape, { backgroundColor: c.carte, borderColor: c.accent }]}>
                <Text selectable style={[styles.commande, { color: c.accentTexte }]}>
                  {guide.etapes[etapeSure].commande}
                </Text>
                <Text style={[styles.quoi, { color: c.texte }]}>{guide.etapes[etapeSure].quoi}</Text>
                <Text style={[styles.pourquoi, { color: c.texteDoux }]}>
                  🛡️ Pour te protéger : {guide.etapes[etapeSure].pourquoi}
                </Text>
                {guide.etapes[etapeSure].cible && (
                  <Text style={[styles.pourquoi, { color: c.accentTexte }]}>
                    ✏️ Cette commande contient une adresse d’exemple. En touchant « Lancer », elle s’écrit dans le
                    terminal sans être validée : remplace l’adresse par la TIENNE, puis appuie sur Entrée.
                  </Text>
                )}
                <Pressable
                  onPress={() => lancer(guide.etapes[etapeSure])}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.lancer, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ color: c.surAccent, fontWeight: '800' }}>
                    {guide.etapes[etapeSure].cible ? '✏️ Écrire dans le terminal' : '▶ Lancer cette commande'}
                  </Text>
                </Pressable>
                <Text style={[styles.astuce, { color: c.texteDoux }]}>
                  Le guide se ferme pour te laisser voir le résultat. Rouvre-le (bouton 🧭 Guide) pour l’étape
                  suivante — tu reviendras ici même.
                </Text>
              </View>

              {etapeSure + 1 < guide.etapes.length ? (
                <>
                  <Text style={[styles.suivantTitre, { color: c.texteDoux }]}>Étape suivante :</Text>
                  <Pressable
                    onPress={() => onEtape(etapeSure + 1)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.suivant, { backgroundColor: c.carte, borderColor: c.bordure, opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={[styles.commande, { color: c.texte }]}>
                        {guide.etapes[etapeSure + 1].commande}
                      </Text>
                      <Text numberOfLines={2} style={[styles.quoi, { color: c.texteDoux }]}>
                        {guide.etapes[etapeSure + 1].quoi}
                      </Text>
                    </View>
                    <Text style={[styles.fleche, { color: c.accentTexte }]}>→</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={[styles.fini, { color: c.texteDoux }]}>
                  ✅ C’est la dernière étape de ce guide. Tu as fait tout le chemin — bravo !
                </Text>
              )}

              {etapeSure > 0 && (
                <Pressable onPress={() => onEtape(etapeSure - 1)} accessibilityRole="button" style={styles.retour}>
                  <Text style={[styles.lien, { color: c.texteDoux }]}>‹ Étape précédente</Text>
                </Pressable>
              )}

              <Text style={[styles.pied, { color: c.texteDoux }]}>
                ⚖️ Uniquement sur tes propres appareils et réseaux, ou avec une autorisation écrite.
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  voile: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panneau: { position: 'absolute', top: 0, bottom: 0, right: 0, borderLeftWidth: StyleSheet.hairlineWidth },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  lien: { fontSize: 15, fontWeight: '700' },
  titre: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  corps: { padding: 16, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20 },
  carte: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  carteTitre: { fontSize: 16, fontWeight: '800' },
  carteBut: { fontSize: 13, lineHeight: 19 },
  carteEtapes: { fontSize: 13, fontWeight: '700' },
  guideTitre: { fontSize: 18, fontWeight: '800' },
  progression: { fontSize: 13, fontWeight: '700' },
  etape: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  commande: { fontFamily: 'monospace', fontSize: 14, fontWeight: '700' },
  quoi: { fontSize: 14, lineHeight: 20 },
  pourquoi: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  lancer: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 2 },
  astuce: { fontSize: 12, lineHeight: 17 },
  suivantTitre: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  suivant: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  fleche: { fontSize: 20, fontWeight: '800' },
  fini: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  retour: { paddingVertical: 8 },
  pied: { fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: 'italic' },
});
