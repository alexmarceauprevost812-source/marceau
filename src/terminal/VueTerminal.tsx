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
  /** Couleur de ce que l'utilisateur tape. */
  saisie: string;
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
  var FIN_SAISIE = '\\x1b[39m';
  var blanc = function(s){ return SAISIE + s + FIN_SAISIE; };
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

  // ----- Mode ligne (Termux) -----
  var ligne = '', historique = [], position = 0;
  function remplacerLigne(nouvelle){
    for (var i = 0; i < Array.from(ligne).length; i++) term.write('\\b \\b');
    ligne = nouvelle; term.write(blanc(ligne));
  }
  function saisieLigne(d){
    if (d.charAt(0) === '\\x1b') {
      if (d === '\\x1b[A' && position > 0) { position--; remplacerLigne(historique[position]); }
      else if (d === '\\x1b[B') { if (position < historique.length) position++; remplacerLigne(historique[position] || ''); }
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
        if (ligne) { var a = Array.from(ligne); a.pop(); ligne = a.join(''); term.write('\\b \\b'); }
      } else if (c === '\\x03') {
        term.write('^C\\r\\n'); ligne = ''; envoyer({ type: 'interrompre' });
      } else if (c === '\\x0c') {
        term.clear();
      } else if (c >= ' ' || c === '\\t') {
        ligne += c; term.write(blanc(c));
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
      tapes = ''; // Entrée, flèches, Ctrl… : on repart à zéro
    }
  }
  function colorerEcho(t){
    if (!tapes || MODE !== 'brut') return t;
    var n = 0;
    while (n < t.length && n < tapes.length && t.charAt(n) === tapes.charAt(n)) n++;
    if (n === 0) return t;
    tapes = tapes.slice(n);
    return blanc(t.slice(0, n)) + t.slice(n);
  }

  term.onData(function(d){
    d = appliquerCtrl(d);
    if (MODE === 'ligne') saisieLigne(d);
    else { retenir(d); envoyer({ type: 'entree', donnees: d }); }
  });

  window.M = {
    ecrire: function(t){ term.write(colorerEcho(t)); },
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
