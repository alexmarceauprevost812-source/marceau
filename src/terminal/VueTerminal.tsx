// SPDX-License-Identifier: MIT
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';


/**
 * - « brut »  : chaque touche part tout de suite (vrai terminal : téléphone, Linux, SSH).
 * - « ligne » : on tape une ligne entière, envoyée avec Entrée (Termux).
 */
export type ModeSaisie = 'brut' | 'ligne';

export type Theme = {
  fond: string;
  /** Couleur des réponses (sortie des programmes). */
  texte: string;
  /** Couleur des arguments que l'utilisateur tape. */
  saisie: string;
  /** Couleur du nom de la commande (1er mot tapé). */
  commande: string;
  /** Couleur des messages d'erreur du shell (« mauvaise commande »). */
  erreur: string;
  curseur: string;
  selection: string;
};

export type PoigneeTerminal = {
  ecrire: (texte: string) => void;
  effacer: () => void;
  focus: () => void;
  /** Envoie une touche comme si elle était tapée (barre de touches). */
  touche: (sequence: string) => void;
  /** Active Ctrl pour la prochaine touche. */
  ctrl: (actif: boolean) => void;
  taillePolice: (delta: number) => void;
};

type Props = {
  mode: ModeSaisie;
  theme: Theme;
  /** Le terminal est prêt ; donne sa taille en colonnes × lignes. */
  onPret?: (colonnes: number, lignes: number) => void;
  onTaille?: (colonnes: number, lignes: number) => void;
  /** Mode brut : touches tapées. */
  onEntree?: (donnees: string) => void;
  /** Mode ligne : ligne validée avec Entrée. */
  onLigne?: (ligne: string) => void;
  /** Mode ligne : Ctrl+C. */
  onInterrompre?: () => void;
  /** Ctrl a été utilisé (pour éteindre le bouton). */
  onCtrlUtilise?: () => void;
};

/** « #RRGGBB » → séquence de couleur de texte (24 bits). */
function ansi(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
}

function page(mode: ModeSaisie, t: Theme) {
  // xterm (~500 Ko) n'est chargé qu'à l'ouverture d'un terminal, pas au démarrage de l'appli.
  const { XTERM_CSS, XTERM_FIT_JS, XTERM_JS } = require('./xtermBundle') as typeof import('./xtermBundle');
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${XTERM_CSS}
html,body{margin:0;padding:0;height:100%;background:${t.fond};overflow:hidden}
#t{position:absolute;inset:0;padding:6px 4px 0 6px}
.xterm .xterm-viewport{background:${t.fond}!important}
</style></head><body><div id="t"></div>
<script>${XTERM_JS}</script>
<script>${XTERM_FIT_JS}</script>
<script>
(function(){
  var MODE = ${JSON.stringify(mode)};
  var SAISIE = ${JSON.stringify(ansi(t.saisie))};
  var COMMANDE = ${JSON.stringify(ansi(t.commande))};
  var ERREUR = ${JSON.stringify(ansi(t.erreur))};
  var FIN = '\\x1b[39m';
  // On est dans le NOM de la commande (1er mot) tant qu'aucune espace n'a été tapée : il s'affiche en
  // or, le reste de la ligne (arguments) en vert lime. Remis à vrai à chaque nouvelle commande.
  var enCommande = true;
  function colorerCar(c){
    if (enCommande) {
      if (c === ' ' || c === '\\t') { enCommande = false; return SAISIE + c + FIN; }
      return COMMANDE + c + FIN;
    }
    return SAISIE + c + FIN;
  }
  // Parcours par POINT DE CODE (Array.from) : ne pas couper une paire de substitution (emoji) en
  // insérant des codes couleur entre ses deux moitiés.
  function colorerSaisie(s){ var arr = Array.from(s), o = ''; for (var i = 0; i < arr.length; i++) o += colorerCar(arr[i]); return o; }
  // Colorie une ligne complète (mode ligne) : 1er mot en or, reste en vert lime.
  function rendreLigne(s){
    var sp = -1;
    for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === ' ' || ch === '\\t') { sp = i; break; } }
    if (sp < 0) return s.length ? COMMANDE + s + FIN : '';
    return COMMANDE + s.slice(0, sp) + FIN + SAISIE + s.slice(sp) + FIN;
  }
  // Messages d'erreur du shell mis en rouge (le shell ne signale une mauvaise commande qu'après l'avoir essayée).
  var MOTIFS_ERREUR = [/not found/gi, /No such file or directory/gi, /Permission denied/gi];
  function colorerErreurs(s){
    for (var i = 0; i < MOTIFS_ERREUR.length; i++) s = s.replace(MOTIFS_ERREUR[i], function(m){ return ERREUR + m + FIN; });
    return s;
  }
  var envoyer = function(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  var term = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'monospace',
    scrollback: 5000,
    convertEol: MODE === 'ligne',
    allowProposedApi: false,
    theme: { background: ${JSON.stringify(t.fond)}, foreground: ${JSON.stringify(t.texte)},
             cursor: ${JSON.stringify(t.curseur)}, cursorAccent: ${JSON.stringify(t.fond)},
             selectionBackground: ${JSON.stringify(t.selection)} }
  });
  var fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('t'));

  var derniere = '';
  function ajuster(){
    try { fit.fit(); } catch(e) {}
    var cle = term.cols + 'x' + term.rows;
    if (cle !== derniere) { derniere = cle; envoyer({ type: 'taille', colonnes: term.cols, lignes: term.rows }); }
  }
  window.addEventListener('resize', function(){ setTimeout(ajuster, 50); });

  // ----- Ctrl (bouton de la barre de touches) -----
  var ctrlActif = false;
  function appliquerCtrl(d){
    if (!ctrlActif || d.length !== 1) return d;
    ctrlActif = false;
    envoyer({ type: 'ctrlUtilise' });
    var c = d.toUpperCase().charCodeAt(0);
    if (c >= 64 && c <= 95) return String.fromCharCode(c - 64);
    if (d === ' ') return '\\x00';
    return d;
  }

  // Largeur d'affichage d'un caractère en cellules de terminal (2 pour les emojis / CJK « larges »).
  function largeurCar(cp){
    if (cp >= 0x1100 && (
      cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    )) return 2;
    return 1;
  }
  function largeurLigne(s){
    var arr = Array.from(s), w = 0;
    for (var i = 0; i < arr.length; i++) w += largeurCar(arr[i].codePointAt(0));
    return w;
  }

  // ----- Mode ligne (Termux) -----
  var ligne = '', historique = [], position = 0;
  // Efface la ligne affichée (par LARGEUR d'affichage, pas par nombre de caractères) puis la
  // redessine colorée. Utilisé pour la navigation dans l'historique et l'effacement arrière.
  function afficherLigne(nouvelle){
    var vieux = largeurLigne(ligne);
    for (var i = 0; i < vieux; i++) term.write('\\b \\b');
    ligne = nouvelle; term.write(rendreLigne(ligne));
  }
  function saisieLigne(d){
    if (d.charAt(0) === '\\x1b') {
      if (d === '\\x1b[A' && position > 0) { position--; afficherLigne(historique[position]); }
      else if (d === '\\x1b[B') { if (position < historique.length) position++; afficherLigne(historique[position] || ''); }
      return;
    }
    var car = Array.from(d);
    for (var i = 0; i < car.length; i++) {
      var c = car[i];
      if (c === '\\r' || c === '\\n') {
        term.write('\\r\\n');
        if (ligne.trim()) { historique.push(ligne); }
        position = historique.length;
        envoyer({ type: 'ligne', texte: ligne });
        ligne = '';
      } else if (c === '\\x7f' || c === '\\b') {
        // Efface uniquement le dernier caractère (pas de redessin complet), sur sa largeur d'affichage.
        if (ligne) {
          var a = Array.from(ligne); var dernier = a.pop(); ligne = a.join('');
          var w = largeurCar(dernier.codePointAt(0));
          for (var k = 0; k < w; k++) term.write('\\b \\b');
        }
      } else if (c === '\\x03') {
        term.write('^C\\r\\n'); ligne = ''; envoyer({ type: 'interrompre' });
      } else if (c === '\\x0c') {
        term.clear();
      } else if (c >= ' ' || c === '\\t') {
        // Ajout simple en fin de ligne : on écrit seulement le nouveau caractère coloré (pas de
        // redessin complet), donc pas de décalage avec les caractères larges. Le 1er mot (avant la
        // 1re espace) est en or, le reste en vert lime.
        var enMot = ligne.indexOf(' ') < 0 && ligne.indexOf('\\t') < 0 && c !== ' ' && c !== '\\t';
        ligne += c;
        term.write((enMot ? COMMANDE : SAISIE) + c + FIN);
      }
    }
  }

  // Mode brut : le programme renvoie lui-même ce qu'on tape (écho).
  // On retient les caractères tapés pour colorer leur écho en blanc.
  var tapes = '';
  function retenir(d){
    if (d.length > 0 && d.charAt(0) !== '\\x1b' && d.charCodeAt(0) >= 32 && d.indexOf('\\r') < 0) {
      tapes = (tapes + d).slice(-512);
    } else {
      tapes = ''; enCommande = true; // Entrée, flèches, Ctrl… : nouvelle commande, on repart au 1er mot
    }
  }
  function colorerEcho(t){
    if (!tapes || MODE !== 'brut') return t;
    var n = 0;
    while (n < t.length && n < tapes.length && t.charAt(n) === tapes.charAt(n)) n++;
    if (n === 0) return t;
    tapes = tapes.slice(n);
    return colorerSaisie(t.slice(0, n)) + t.slice(n);
  }

  term.onData(function(d){
    d = appliquerCtrl(d);
    if (MODE === 'ligne') saisieLigne(d);
    else { retenir(d); envoyer({ type: 'entree', donnees: d }); }
  });

  window.M = {
    ecrire: function(t){ term.write(colorerErreurs(colorerEcho(t))); },
    effacer: function(){ term.clear(); },
    focus: function(){ term.focus(); },
    touche: function(s){ term.input(s, true); },
    ctrl: function(a){ ctrlActif = a; term.focus(); },
    police: function(delta){
      term.options.fontSize = Math.max(8, Math.min(28, term.options.fontSize + delta));
      ajuster();
    }
  };

  setTimeout(function(){ ajuster(); envoyer({ type: 'pret', colonnes: term.cols, lignes: term.rows }); term.focus(); }, 60);
})();
</script></body></html>`;
}

/** Écran de terminal (xterm.js) — fonctionne hors ligne. */
export const VueTerminal = forwardRef<PoigneeTerminal, Props>(function VueTerminal(props, ref) {
  const vue = useRef<WebView>(null);
  const pret = useRef(false);
  const enAttente = useRef('');
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rappels = useRef(props);
  rappels.current = props;

  // La page n'est générée qu'une fois (le thème et le mode ne changent pas en cours de session).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => page(props.mode, props.theme), []);

  const executer = useCallback((code: string) => {
    vue.current?.injectJavaScript(`try{${code}}catch(e){};true;`);
  }, []);

  /** Regroupe les petits morceaux de texte pour éviter de saturer la WebView. */
  const vider = useCallback(() => {
    minuterie.current = null;
    if (!pret.current || !enAttente.current) return;
    const texte = enAttente.current;
    enAttente.current = '';
    executer(`window.M.ecrire(${JSON.stringify(texte)})`);
  }, [executer]);

  useImperativeHandle(
    ref,
    () => ({
      ecrire: (texte) => {
        enAttente.current += texte;
        if (!minuterie.current) minuterie.current = setTimeout(vider, 16);
      },
      effacer: () => executer('window.M.effacer()'),
      focus: () => executer('window.M.focus()'),
      touche: (s) => executer(`window.M.touche(${JSON.stringify(s)})`),
      ctrl: (a) => executer(`window.M.ctrl(${a ? 'true' : 'false'})`),
      taillePolice: (d) => executer(`window.M.police(${d})`),
    }),
    [executer, vider],
  );

  const surMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let m: { type: string; [k: string]: unknown };
      try {
        m = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      const p = rappels.current;
      switch (m.type) {
        case 'pret':
          pret.current = true;
          p.onPret?.(m.colonnes as number, m.lignes as number);
          vider();
          break;
        case 'taille':
          p.onTaille?.(m.colonnes as number, m.lignes as number);
          break;
        case 'entree':
          p.onEntree?.(m.donnees as string);
          break;
        case 'ligne':
          p.onLigne?.(m.texte as string);
          break;
        case 'interrompre':
          p.onInterrompre?.();
          break;
        case 'ctrlUtilise':
          p.onCtrlUtilise?.();
          break;
      }
    },
    [vider],
  );

  return (
    <View style={[styles.flex, { backgroundColor: props.theme.fond }]}>
      <WebView
        ref={vue}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={surMessage}
        javaScriptEnabled
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        setSupportMultipleWindows={false}
        overScrollMode="never"
        style={[styles.flex, { backgroundColor: props.theme.fond }]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
