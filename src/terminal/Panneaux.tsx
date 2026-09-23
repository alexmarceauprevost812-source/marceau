import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type Permission,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { Terminal, type InfosTerminal, type OptionsSsh } from '../../modules/marceau-terminal';
import type { Couleurs } from '../theme';
import { BarreTouches } from './BarreTouches';
import { VueTerminal, type PoigneeTerminal, type Theme } from './VueTerminal';

/** Terminal : fond noir, réponses en vert lime, ce que tu tapes en blanc. */
export const THEME_TERMINAL: Theme = {
  fond: '#000000',
  texte: '#A6FF00',
  saisie: '#FFFFFF',
  curseur: '#FFFFFF',
  selection: 'rgba(166,255,0,0.3)',
};

const GRIS = (t: string) => `\x1b[2m${t}\x1b[0m`;
const ROUGE = (t: string) => `\x1b[31m${t}\x1b[0m`;
const ORANGE = (t: string) => `\x1b[38;5;208m${t}\x1b[0m`;

type Base = { couleurs: Couleurs; infos: InfosTerminal; rafraichir: () => void };

/** Écoute la sortie et la fin d'une session native. */
function useSession(id: string, terminal: React.RefObject<PoigneeTerminal | null>, surFin: (code: number) => void) {
  const fin = useRef(surFin);
  fin.current = surFin;
  useEffect(() => {
    if (!Terminal) return;
    const a = Terminal.addListener('onSortie', (e) => {
      if (e.id === id) terminal.current?.ecrire(e.donnees);
    });
    const b = Terminal.addListener('onFin', (e) => {
      if (e.id === id) fin.current(e.code);
    });
    return () => {
      a.remove();
      b.remove();
      Terminal?.fermer(id);
    };
  }, [id, terminal]);
}

/** Terminal + barre de touches, prêts à brancher sur une session. */
function Console({
  couleurs,
  terminal,
  mode = 'brut',
  onPret,
  onEntree,
  onLigne,
  onInterrompre,
  onTaille,
}: {
  couleurs: Couleurs;
  terminal: React.RefObject<PoigneeTerminal | null>;
  mode?: 'brut' | 'ligne';
  onPret?: (c: number, l: number) => void;
  onEntree?: (d: string) => void;
  onLigne?: (l: string) => void;
  onInterrompre?: () => void;
  onTaille?: (c: number, l: number) => void;
}) {
  const [ctrl, setCtrl] = useState(false);
  return (
    <View style={styles.flex}>
      <VueTerminal
        ref={terminal}
        mode={mode}
        theme={THEME_TERMINAL}
        onPret={onPret}
        onTaille={onTaille}
        onEntree={onEntree}
        onLigne={onLigne}
        onInterrompre={onInterrompre}
        onCtrlUtilise={() => setCtrl(false)}
      />
      <BarreTouches terminal={terminal} couleurs={couleurs} ctrlActif={ctrl} setCtrlActif={setCtrl} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Options 1 et 4 : shell du téléphone et Linux (PRoot), sur un vrai PTY
// ---------------------------------------------------------------------------

function SessionPty({ couleurs, type }: { couleurs: Couleurs; type: 'telephone' | 'linux' }) {
  const terminal = useRef<PoigneeTerminal>(null);
  const id = type;
  const taille = useRef({ c: 80, l: 24 });
  const [terminee, setTerminee] = useState(false);

  const ouvrir = useCallback(async () => {
    if (!Terminal) return;
    setTerminee(false);
    const { c, l } = taille.current;
    try {
      if (type === 'linux') await Terminal.ouvrirLinux(id, c, l);
      else await Terminal.ouvrirTelephone(id, c, l);
    } catch (e) {
      terminal.current?.ecrire(ROUGE(`Impossible de démarrer : ${(e as Error).message}\r\n`));
      setTerminee(true);
    }
  }, [id, type]);

  useSession(id, terminal, (code) => {
    setTerminee(true);
    terminal.current?.ecrire(GRIS(`\r\n[session terminée (code ${code}) — Entrée pour relancer]\r\n`));
  });

  return (
    <Console
      couleurs={couleurs}
      terminal={terminal}
      onPret={(c, l) => {
        taille.current = { c, l };
        if (type === 'linux') {
          terminal.current?.ecrire(
            GRIS('Alpine Linux — installe des outils avec : apk add python3 git nodejs nano\r\n') +
              GRIS('Tes fichiers du terminal Téléphone sont dans /telephone\r\n\r\n'),
          );
        }
        ouvrir();
      }}
      onTaille={(c, l) => {
        taille.current = { c, l };
        Terminal?.redimensionner(id, c, l);
      }}
      onEntree={(d) => {
        if (terminee) {
          if (d.includes('\r')) ouvrir();
          return;
        }
        Terminal?.ecrire(id, d).catch(() => {});
      }}
    />
  );
}

export function PanneauTelephone({ couleurs }: Base) {
  return <SessionPty couleurs={couleurs} type="telephone" />;
}

export function PanneauLinux({ couleurs: c, infos, rafraichir }: Base) {
  const [installation, setInstallation] = useState<{ etape: string; pourcent: number } | null>(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (!Terminal) return;
    const a = Terminal.addListener('onLinux', (e) => setInstallation(e));
    return () => a.remove();
  }, []);

  if (!infos.prootDisponible) {
    return (
      <Info
        couleurs={c}
        titre="Linux n'est pas inclus dans cet APK"
        texte="Le moteur PRoot n'a pas pu être téléchargé pendant la construction de l'APK. Relance la construction (Actions → Construire l'APK Android) : l'onglet Linux fonctionnera dans la prochaine version."
      />
    );
  }

  if (!infos.linuxInstalle) {
    const installer = async () => {
      setErreur('');
      setInstallation({ etape: 'Préparation…', pourcent: 0 });
      try {
        await Terminal!.installerLinux();
        rafraichir();
      } catch (e) {
        setErreur((e as Error).message);
      } finally {
        setInstallation(null);
      }
    };
    return (
      <Info
        couleurs={c}
        titre="Un vrai Linux dans ton téléphone"
        texte="Marceau peut installer Alpine Linux (environ 4 Mo à télécharger). Tu pourras ensuite ajouter Python, Git, Node.js et des milliers d'autres outils avec la commande apk."
      >
        {installation && (
          <Text style={[styles.corps, { color: c.texte }]}>
            {installation.etape}
            {installation.pourcent > 0 && installation.pourcent < 100 ? ` ${installation.pourcent} %` : ''}
          </Text>
        )}
        {!!erreur && <Text style={[styles.corps, { color: c.danger }]}>Échec : {erreur}</Text>}
        <Bouton couleurs={c} libelle={installation ? 'Installation…' : 'Installer Linux'} onPress={installer} desactive={!!installation} />
      </Info>
    );
  }

  return <SessionPty couleurs={c} type="linux" />;
}

// ---------------------------------------------------------------------------
// Option 2 : Termux
// ---------------------------------------------------------------------------

const MAISON_TERMUX = '/data/data/com.termux/files/home';
/** Fichier où une commande note le numéro de son shell, pour pouvoir l'interrompre (Ctrl+C). */
const pidTermux = (n: number) => `/data/data/com.termux/files/usr/tmp/marceau-commande-${n}.pid`;
const guillemets = (t: string) => `'${t.replace(/'/g, `'\\''`)}'`;

export function PanneauTermux({ couleurs: c, infos, rafraichir }: Base) {
  const terminal = useRef<PoigneeTerminal>(null);
  const dossier = useRef(MAISON_TERMUX);
  const occupe = useRef(false);
  // Change à chaque commande : le résultat d'une commande interrompue est ignoré.
  const numero = useRef(0);
  const [message, setMessage] = useState('');

  const invite = useCallback(() => {
    const d = dossier.current.startsWith(MAISON_TERMUX) ? '~' + dossier.current.slice(MAISON_TERMUX.length) : dossier.current;
    terminal.current?.ecrire(`${ORANGE('termux')}:${d}$ `);
  }, []);

  const executer = useCallback(
    async (ligne: string) => {
      if (!Terminal) return;
      if (!ligne.trim()) return invite();
      if (occupe.current) {
        terminal.current?.ecrire(GRIS('(une commande est déjà en cours)\n'));
        return;
      }
      occupe.current = true;
      const moi = ++numero.current;
      // On garde le dossier courant entre les commandes (cd fonctionne).
      const pid = pidTermux(moi);
      const script =
        `printf %s $$ > ${pid}\ncd ${guillemets(dossier.current)} 2>/dev/null\n${ligne}\n__c=$?\n` +
        `rm -f ${pid}\nprintf '\\036%s' "$PWD"\nexit $__c`;
      try {
        const r = await Terminal.termux(script, dossier.current);
        if (moi !== numero.current) return; // interrompue entre-temps
        let sortie = r.stdout;
        const i = sortie.lastIndexOf('\x1e');
        if (i >= 0) {
          dossier.current = sortie.slice(i + 1).trim() || dossier.current;
          sortie = sortie.slice(0, i);
        }
        if (sortie) terminal.current?.ecrire(sortie.endsWith('\n') ? sortie : sortie + '\n');
        if (r.stderr) terminal.current?.ecrire(ROUGE(r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n'));
        if (r.erreur) {
          terminal.current?.ecrire(ROUGE(`${r.erreur}\n`));
          if (/allow-external-apps/i.test(r.erreur)) {
            terminal.current?.ecrire(
              GRIS("Dans Termux, tape : echo 'allow-external-apps = true' >> ~/.termux/termux.properties\n") +
                GRIS('puis ferme et rouvre Termux.\n'),
            );
          }
        } else if (r.code !== 0) {
          terminal.current?.ecrire(GRIS(`[code ${r.code}]\n`));
        }
      } catch (e) {
        if (moi !== numero.current) return;
        terminal.current?.ecrire(ROUGE(`${(e as Error).message}\n`));
      } finally {
        if (moi === numero.current) {
          occupe.current = false;
          invite();
        }
      }
    },
    [invite],
  );

  /** Ctrl+C : arrête la commande en cours dans Termux (ping, tail -f…) et rend la main. */
  const interrompre = useCallback(() => {
    if (occupe.current && Terminal) {
      // Le fichier de CETTE commande : une nouvelle commande tapée juste après a le sien.
      const pid = pidTermux(numero.current++);
      occupe.current = false;
      const arret =
        `p=$(cat ${pid} 2>/dev/null); rm -f ${pid}; [ -n "$p" ] || exit 0\n` +
        `pkill -INT -P "$p"; sleep 1; pkill -KILL -P "$p"; kill -KILL "$p" 2>/dev/null; exit 0`;
      Terminal.termux(arret, MAISON_TERMUX).catch(() => {});
      terminal.current?.ecrire(GRIS('(commande interrompue)\n'));
    }
    invite();
  }, [invite]);

  if (!infos.termuxInstalle) {
    return (
      <Info
        couleurs={c}
        titre="Termux n'est pas installé"
        texte={
          <>
            Termux est une appli gratuite qui ajoute un Linux complet à Android. Installe-la depuis F-Droid (la version
            du Play Store est ancienne), ouvre-la une fois, puis tape :{'\n\n'}
            <Text style={styles.code}>echo 'allow-external-apps = true' {'>>'} ~/.termux/termux.properties</Text>
            {'\n\n'}Ferme et rouvre Termux, puis reviens ici.
          </>
        }
      >
        <Bouton couleurs={c} libelle="Ouvrir F-Droid" onPress={() => Linking.openURL('https://f-droid.org/packages/com.termux/')} />
        <Bouton couleurs={c} libelle="J'ai installé Termux" onPress={rafraichir} secondaire />
      </Info>
    );
  }

  if (!infos.termuxPermission) {
    const demander = async () => {
      const r = await PermissionsAndroid.request('com.termux.permission.RUN_COMMAND' as Permission);
      if (r !== PermissionsAndroid.RESULTS.GRANTED) {
        setMessage('Permission refusée. Tu peux l’accorder dans Réglages Android → Applis → Marceau → Autorisations.');
      }
      rafraichir();
    };
    return (
      <Info
        couleurs={c}
        titre="Autoriser Marceau à parler à Termux"
        texte="Android demande ta permission pour que Marceau puisse envoyer des commandes à Termux."
      >
        {!!message && <Text style={[styles.corps, { color: c.danger }]}>{message}</Text>}
        <Bouton couleurs={c} libelle="Autoriser" onPress={demander} />
      </Info>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.barreAction, { borderColor: c.bordure }]}>
        <Text style={[styles.petit, { color: c.texteDoux }]} numberOfLines={2}>
          Commandes non interactives (ex. pkg install -y python). Pour vim ou htop :
        </Text>
        <Bouton
          couleurs={c}
          libelle="Ouvrir Termux"
          compact
          onPress={() => Terminal?.ouvrirDansTermux(`cd ${guillemets(dossier.current)}; exec bash -l`).catch(() => {})}
        />
      </View>
      <Console
        couleurs={c}
        terminal={terminal}
        mode="ligne"
        onPret={() => {
          terminal.current?.ecrire(GRIS('Connecté à Termux.\n'));
          invite();
        }}
        onLigne={executer}
        onInterrompre={interrompre}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Option 3 : SSH vers un ordinateur
// ---------------------------------------------------------------------------

const CLE_SSH = 'marceau-terminal-ssh';

type Formulaire = { hote: string; port: string; utilisateur: string; motDePasse: string; cle: string; phrase: string; memoriser: boolean };
const VIDE: Formulaire = { hote: '', port: '22', utilisateur: '', motDePasse: '', cle: '', phrase: '', memoriser: true };

export function PanneauSsh({ couleurs: c }: Base) {
  const [form, setForm] = useState<Formulaire>(VIDE);
  const [connecte, setConnecte] = useState(false);
  const [avecCle, setAvecCle] = useState(false);
  const [message, setMessage] = useState('');
  const terminal = useRef<PoigneeTerminal>(null);
  const id = 'ssh';
  // Numéro de la tentative de connexion : une tentative annulée (Déconnecter) ne touche plus l'écran.
  const tentative = useRef(0);

  useEffect(() => {
    SecureStore.getItemAsync(CLE_SSH)
      .then((brut) => {
        if (!brut) return;
        const lu = { ...VIDE, ...JSON.parse(brut) } as Formulaire;
        setForm(lu);
        setAvecCle(!!lu.cle);
      })
      .catch(() => {});
  }, []);

  useSession(id, terminal, (code) => {
    setConnecte(false);
    setMessage(code === 0 ? 'Déconnecté.' : `Connexion terminée (code ${code}).`);
  });

  const maj = (champ: keyof Formulaire) => (v: string | boolean) => setForm((f) => ({ ...f, [champ]: v }));

  const connecter = async () => {
    if (!form.hote.trim() || !form.utilisateur.trim()) {
      setMessage('Entre l’adresse de l’ordinateur et ton nom d’utilisateur.');
      return;
    }
    setMessage('');
    if (form.memoriser) await SecureStore.setItemAsync(CLE_SSH, JSON.stringify(form)).catch(() => {});
    else await SecureStore.deleteItemAsync(CLE_SSH).catch(() => {});
    setConnecte(true);
  };

  if (connecte) {
    const options: OptionsSsh = {
      hote: form.hote.trim(),
      port: Number(form.port) || 22,
      utilisateur: form.utilisateur.trim(),
      motDePasse: avecCle ? undefined : form.motDePasse,
      cle: avecCle ? form.cle : undefined,
      phrase: avecCle ? form.phrase : undefined,
    };
    return (
      <View style={styles.flex}>
        <View style={[styles.barreAction, { borderColor: c.bordure }]}>
          <Text style={[styles.petit, { color: c.texte, flex: 1 }]} numberOfLines={1}>
            {options.utilisateur}@{options.hote}
          </Text>
          <Bouton couleurs={c} libelle="Déconnecter" compact secondaire onPress={() => { tentative.current++; Terminal?.fermer(id); setConnecte(false); }} />
        </View>
        <Console
          couleurs={c}
          terminal={terminal}
          onPret={(colonnes, lignes) => {
            terminal.current?.ecrire(GRIS(`Connexion à ${options.hote}…\r\n`));
            const essai = ++tentative.current;
            Terminal?.ouvrirSsh(id, options, colonnes, lignes).catch((e: Error) => {
              if (essai !== tentative.current) return;
              setConnecte(false);
              setMessage(e.message);
            });
          }}
          onTaille={(col, lig) => Terminal?.redimensionner(id, col, lig)}
          onEntree={(d) => Terminal?.ecrire(id, d).catch(() => {})}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.formulaire} keyboardShouldPersistTaps="handled">
      <Text style={[styles.titre, { color: c.texte }]}>Se connecter à un ordinateur</Text>
      <Text style={[styles.corps, { color: c.texteDoux }]}>
        Sur ton ordi Ubuntu : sudo apt install openssh-server, puis hostname -I pour voir son adresse. Hors de la maison,
        Tailscale (gratuit) relie ton téléphone et ton ordi.
      </Text>
      <Champ couleurs={c} libelle="Adresse (IP ou nom)" valeur={form.hote} onChange={maj('hote')} placeholder="192.168.1.20" />
      <View style={styles.ligne}>
        <View style={styles.flex}>
          <Champ couleurs={c} libelle="Utilisateur" valeur={form.utilisateur} onChange={maj('utilisateur')} placeholder="alex" />
        </View>
        <View style={{ width: 90 }}>
          <Champ couleurs={c} libelle="Port" valeur={form.port} onChange={maj('port')} clavier="number-pad" />
        </View>
      </View>
      <View style={styles.ligneInter}>
        <Text style={[styles.corps, { color: c.texte }]}>Utiliser une clé SSH</Text>
        <Switch value={avecCle} onValueChange={setAvecCle} trackColor={{ true: c.accent }} />
      </View>
      {avecCle ? (
        <>
          <Champ couleurs={c} libelle="Clé privée (colle tout le texte)" valeur={form.cle} onChange={maj('cle')} multiligne secret={false} />
          <Champ couleurs={c} libelle="Phrase secrète de la clé (si elle en a une)" valeur={form.phrase} onChange={maj('phrase')} secret />
        </>
      ) : (
        <Champ couleurs={c} libelle="Mot de passe" valeur={form.motDePasse} onChange={maj('motDePasse')} secret />
      )}
      <View style={styles.ligneInter}>
        <Text style={[styles.corps, { color: c.texte }]}>Mémoriser (coffre sécurisé)</Text>
        <Switch value={form.memoriser} onValueChange={maj('memoriser')} trackColor={{ true: c.accent }} />
      </View>
      {!!message && <Text style={[styles.corps, { color: c.danger }]}>{message}</Text>}
      <Bouton couleurs={c} libelle="Se connecter" onPress={connecter} />
      <Bouton
        couleurs={c}
        libelle="Oublier les empreintes des serveurs"
        secondaire
        onPress={() => Terminal?.oublierServeursSsh().then(() => setMessage('Empreintes oubliées.'))}
      />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Petits composants
// ---------------------------------------------------------------------------

function Info({
  couleurs: c,
  titre,
  texte,
  children,
}: {
  couleurs: Couleurs;
  titre: string;
  texte: ReactNode;
  children?: ReactNode;
}) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.formulaire}>
      <Text style={[styles.titre, { color: c.texte }]}>{titre}</Text>
      <Text style={[styles.corps, { color: c.texteDoux }]}>{texte}</Text>
      {children}
    </ScrollView>
  );
}

function Bouton({
  couleurs: c,
  libelle,
  onPress,
  desactive,
  secondaire,
  compact,
}: {
  couleurs: Couleurs;
  libelle: string;
  onPress: () => void;
  desactive?: boolean;
  secondaire?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
        onPress={onPress}
        disabled={desactive}
        accessibilityRole="button"
        style={({ pressed }) => [
          compact ? styles.boutonCompact : styles.bouton,
          secondaire ? { borderWidth: 1, borderColor: c.bordure } : { backgroundColor: c.accent },
          { opacity: desactive ? 0.5 : pressed ? 0.7 : 1 },
        ]}
      >
        {desactive && <ActivityIndicator size="small" color={c.surAccent} />}
      <Text style={[styles.texteBouton, { color: secondaire ? c.texte : c.surAccent }]}>{libelle}</Text>
    </Pressable>
  );
}

function Champ({
  couleurs: c,
  libelle,
  valeur,
  onChange,
  placeholder,
  secret,
  multiligne,
  clavier,
}: {
  couleurs: Couleurs;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  multiligne?: boolean;
  clavier?: 'default' | 'number-pad';
}) {
  return (
    <View style={styles.champ}>
      <Text style={[styles.libelle, { color: c.texte }]}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.texteDoux}
        secureTextEntry={secret}
        multiline={multiligne}
        keyboardType={clavier}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.entree,
          multiligne && styles.entreeHaute,
          { color: c.texte, borderColor: c.bordure, backgroundColor: c.carte },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  formulaire: { padding: 20, gap: 12 },
  titre: { fontSize: 20, fontWeight: '800' },
  corps: { fontSize: 15, lineHeight: 22 },
  petit: { fontSize: 12, flexShrink: 1 },
  code: { fontFamily: 'monospace', fontSize: 13 },
  ligne: { flexDirection: 'row', gap: 10 },
  ligneInter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barreAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bouton: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  boutonCompact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  texteBouton: { fontSize: 15, fontWeight: '700' },
  champ: { gap: 6 },
  libelle: { fontSize: 13, fontWeight: '600' },
  entree: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  entreeHaute: { minHeight: 120, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 },
});
