#!/usr/bin/env node
/**
 * Emballe xterm.js (le moteur d'affichage du Terminal) dans un fichier TypeScript,
 * pour que le Terminal fonctionne sans internet. Lancé automatiquement après
 * « npm install » (script postinstall). Le fichier produit n'est pas versionné.
 */
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const lire = (p) => fs.readFileSync(path.join(racine, 'node_modules', p), 'utf8');
// Empêche un « </script> » dans le code de fermer la balise de la page.
const sur = (t) => t.replace(/<\/(script|style)/gi, '<\\/$1');

try {
  const js = sur(lire('@xterm/xterm/lib/xterm.js'));
  const fit = sur(lire('@xterm/addon-fit/lib/addon-fit.js'));
  const css = sur(lire('@xterm/xterm/css/xterm.css'));
  const sortie = path.join(racine, 'src', 'terminal', 'xtermBundle.ts');
  fs.writeFileSync(
    sortie,
    '// Fichier généré par scripts/xterm-bundle.js — ne pas modifier.\n' +
      `export const XTERM_JS = ${JSON.stringify(js)};\n` +
      `export const XTERM_FIT_JS = ${JSON.stringify(fit)};\n` +
      `export const XTERM_CSS = ${JSON.stringify(css)};\n`,
  );
  console.log('xterm.js emballé dans src/terminal/xtermBundle.ts');
} catch (e) {
  console.error('Impossible d’emballer xterm.js :', e.message);
  process.exit(1);
}
