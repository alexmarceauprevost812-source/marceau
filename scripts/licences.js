#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Prépare la liste des licences affichée dans l'appli (Bureau → Licences) :
 *  - les composants natifs inclus dans l'APK, avec le texte complet de leur licence
 *    (dossier licences/) ;
 *  - toutes les bibliothèques JavaScript incluses (nom, version, licence), lues dans node_modules.
 * Lancé automatiquement après « npm install » (postinstall). Le fichier produit n'est pas versionné.
 */
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..');
const texte = (f) => fs.readFileSync(path.join(racine, f), 'utf8').trim();
const pkg = JSON.parse(texte('package.json'));
const versionNpm = (nom) => {
  try {
    return JSON.parse(texte(`node_modules/${nom}/package.json`)).version;
  } catch {
    return '?';
  }
};

// Composants natifs (hors npm) inclus dans l'APK.
// ⚠️ Garder les versions à jour avec scripts/construire-linux.sh et modules/marceau-terminal/android/build.gradle.
const NATIFS = [
  {
    nom: 'PRoot (fork Termux)',
    version: '5.1.107.94',
    licence: 'GPL-2.0-or-later',
    role: 'Moteur du Linux intégré (Terminal → Linux)',
    auteurs: 'STMicroelectronics, les contributeurs de PRoot et de Termux',
    source: 'https://github.com/termux/proot',
    textes: ['licences/proot.txt'],
  },
  {
    nom: 'talloc',
    version: '2.4.3',
    licence: 'LGPL-3.0-or-later',
    role: 'Bibliothèque utilisée par PRoot',
    auteurs: 'Andrew Tridgell, Stefan Metzmacher (projet Samba)',
    source: 'https://talloc.samba.org',
    textes: ['licences/talloc-LGPL-3.0.txt', 'licences/GPL-3.0.txt'],
  },
  {
    nom: 'libandroid-shmem',
    version: '0.7',
    licence: 'BSD-3-Clause',
    role: 'Mémoire partagée pour PRoot',
    auteurs: 'Sergii Pylypenko, Fredrik Fornwall',
    source: 'https://github.com/termux/libandroid-shmem',
    textes: ['licences/libandroid-shmem.txt'],
  },
  {
    nom: 'JSch (fork mwiede)',
    version: '0.2.20',
    licence: 'BSD-3-Clause',
    role: 'Connexion SSH (Terminal → Ordi)',
    auteurs: 'Atsuhiko Yamanaka (JCraft), Matthias Wiedemann et contributeurs',
    source: 'https://github.com/mwiede/jsch',
    textes: ['licences/jsch.txt'],
  },
  {
    nom: 'Bouncy Castle',
    version: '1.78.1',
    licence: 'MIT',
    role: 'Chiffrement pour les clés SSH',
    auteurs: 'The Legion of the Bouncy Castle Inc.',
    source: 'https://www.bouncycastle.org',
    textes: ['licences/bouncycastle.txt'],
  },
  {
    nom: 'xterm.js + addon-fit',
    version: versionNpm('@xterm/xterm'),
    licence: 'MIT',
    role: 'Affichage du Terminal',
    auteurs: 'The xterm.js authors',
    source: 'https://github.com/xtermjs/xterm.js',
    textes: ['licences/xterm.txt'],
  },
].map((c) => ({ ...c, texte: c.textes.map(texte).join('\n\n' + '─'.repeat(40) + '\n\n') }));

// Bibliothèques JavaScript : dépendances de production, récursivement.
function licenceDe(p) {
  if (typeof p.license === 'string') return p.license;
  if (p.license?.type) return p.license.type;
  if (Array.isArray(p.licenses)) return p.licenses.map((l) => l.type || l).join(' OR ');
  return 'Voir le paquet';
}

function trouver(nom, depuis) {
  let dossier = depuis;
  for (;;) {
    const f = path.join(dossier, 'node_modules', nom, 'package.json');
    if (fs.existsSync(f)) return f;
    const parent = path.dirname(dossier);
    if (parent === dossier) return null;
    dossier = parent;
  }
}

const vus = new Map();
function parcourir(nom, depuis) {
  const f = trouver(nom, depuis);
  if (!f) return;
  const reel = fs.realpathSync(f);
  if (vus.has(reel)) return;
  const p = JSON.parse(fs.readFileSync(reel, 'utf8'));
  vus.set(reel, { nom: p.name || nom, version: p.version || '?', licence: licenceDe(p) });
  const dossier = path.dirname(reel);
  for (const d of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) parcourir(d, dossier);
}
for (const d of Object.keys(pkg.dependencies || {})) parcourir(d, racine);
const js = [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom));

const sortie = path.join(racine, 'src', 'licences', 'generees.ts');
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(
  sortie,
  '// Fichier généré par scripts/licences.js — ne pas modifier.\n' +
    `export const LICENCE_MARCEAU = ${JSON.stringify(texte('LICENSE'))};\n` +
    `export const COMPOSANTS_NATIFS = ${JSON.stringify(NATIFS.map(({ textes, ...c }) => c))};\n` +
    `export const BIBLIOTHEQUES_JS: { nom: string; version: string; licence: string }[] = ${JSON.stringify(js)};\n`,
);
console.log(`Licences : ${NATIFS.length} composants natifs, ${js.length} bibliothèques JavaScript`);
