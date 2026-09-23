#!/usr/bin/env node
/**
 * Télécharge PRoot (le moteur du mini-Linux du Terminal) depuis les paquets Termux et
 * le place dans le module natif, sous forme de « lib*.so » : Android n'autorise à
 * exécuter que les programmes livrés dans l'APK de cette façon.
 *
 * Lancé automatiquement pendant la construction de l'APK (hook eas-build-post-install).
 * À la main : npm run preparer-linux
 *
 * Si le téléchargement échoue, l'APK se construit quand même : l'onglet Linux
 * indiquera simplement qu'il n'est pas disponible.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const DEPOTS = [
  'https://packages.termux.dev/apt/termux-main',
  'https://packages-cf.termux.dev/apt/termux-main',
];
// Architecture Termux → dossier Android.
const ARCHS = { aarch64: 'arm64-v8a', arm: 'armeabi-v7a', x86_64: 'x86_64', i686: 'x86' };
const PREFIXE = 'data/data/com.termux/files/usr';
const DESTINATION = path.join(__dirname, '..', 'modules', 'marceau-terminal', 'android', 'src', 'main', 'jniLibs');

async function telecharger(chemin) {
  let derniere;
  for (const depot of DEPOTS) {
    try {
      const r = await fetch(`${depot}/${chemin}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      derniere = e;
    }
  }
  throw new Error(`${chemin} : ${derniere?.message}`);
}

/** Trouve le fichier .deb d'un paquet et son SHA-256 dans l'index « Packages ». */
function trouverPaquet(index, nom) {
  for (const bloc of index.split(/\n\n+/)) {
    if (new RegExp(`^Package: ${nom}$`, 'm').test(bloc)) {
      const fichier = bloc.match(/^Filename: (.+)$/m);
      const empreinte = bloc.match(/^SHA256: ([0-9a-f]{64})$/m);
      if (fichier && empreinte) return { fichier: fichier[1].trim(), empreinte: empreinte[1] };
    }
  }
  throw new Error(`paquet ${nom} introuvable (ou sans SHA-256)`);
}

/** Paquets embarqués : PRoot et les bibliothèques dont il a besoin. */
const PAQUETS = ['proot', 'libtalloc', 'libandroid-shmem'];

/** Noms des paquets listés dans le champ « Depends: » d'un paquet. */
function dependances(index, nom) {
  for (const bloc of index.split(/\n\n+/)) {
    if (!new RegExp(`^Package: ${nom}$`, 'm').test(bloc)) continue;
    const m = bloc.match(/^Depends: (.+)$/m);
    return m ? m[1].split(',').map((d) => d.trim().split(/[\s(]/)[0]).filter(Boolean) : [];
  }
  return [];
}

/** Télécharge un fichier et refuse de l'utiliser si son SHA-256 ne correspond pas. */
async function telechargerVerifie(chemin, empreinte) {
  const contenu = await telecharger(chemin);
  if (sha256(contenu) !== empreinte) throw new Error(`${chemin} : empreinte SHA-256 différente, fichier refusé`);
  return contenu;
}

/** SHA-256 de l'index « Packages » d'une architecture, lu dans le fichier « Release » du dépôt. */
function empreinteIndex(release, arch) {
  const section = release.split(/^SHA256:$/m)[1] ?? '';
  const m = section.match(new RegExp(`^\\s*([0-9a-f]{64})\\s+\\d+\\s+main/binary-${arch}/Packages$`, 'm'));
  if (!m) throw new Error(`empreinte de l'index ${arch} absente du fichier Release`);
  return m[1];
}

/** Extrait l'archive data.tar.* d'un .deb (format « ar ») dans un dossier. */
function extraireDeb(deb, dossier) {
  if (deb.subarray(0, 8).toString() !== '!<arch>\n') throw new Error('fichier .deb invalide');
  let pos = 8;
  while (pos + 60 <= deb.length) {
    const nom = deb.subarray(pos, pos + 16).toString().trim().replace(/\/$/, '');
    const taille = parseInt(deb.subarray(pos + 48, pos + 58).toString().trim(), 10);
    const debut = pos + 60;
    if (nom.startsWith('data.tar')) {
      const archive = path.join(dossier, nom);
      fs.writeFileSync(archive, deb.subarray(debut, debut + taille));
      execFileSync('tar', ['-xf', archive, '-C', dossier]);
      return;
    }
    pos = debut + taille + (taille % 2);
  }
  throw new Error('data.tar introuvable dans le .deb');
}

async function preparer(arch, abi) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `proot-${arch}-`));
  // Chaîne de vérification : Release → empreinte de Packages → empreinte de chaque .deb.
  const release = (await telecharger('dists/stable/Release')).toString();
  const index = (
    await telechargerVerifie(`dists/stable/main/binary-${arch}/Packages`, empreinteIndex(release, arch))
  ).toString();
  // Si PRoot gagne une dépendance qu'on n'embarque pas, on s'arrête : un PRoot incomplet
  // planterait au lancement, mieux vaut un onglet Linux marqué indisponible.
  const manquantes = dependances(index, 'proot').filter((d) => !PAQUETS.includes(d));
  if (manquantes.length) throw new Error(`dépendances de proot non prises en charge : ${manquantes.join(', ')}`);
  for (const paquet of PAQUETS) {
    const { fichier, empreinte } = trouverPaquet(index, paquet);
    extraireDeb(await telechargerVerifie(fichier, empreinte), tmp);
  }
  const usr = path.join(tmp, PREFIXE);
  const sortie = path.join(DESTINATION, abi);
  fs.mkdirSync(sortie, { recursive: true });
  const copier = (source, nom, obligatoire = true) => {
    const s = path.join(usr, source);
    if (!fs.existsSync(s)) {
      if (obligatoire) throw new Error(`${source} absent du paquet`);
      return;
    }
    fs.copyFileSync(fs.realpathSync(s), path.join(sortie, nom));
  };
  copier('bin/proot', 'libproot.so');
  copier('libexec/proot/loader', 'libproot-loader.so');
  copier('libexec/proot/loader32', 'libproot-loader32.so', false);
  copier('lib/libtalloc.so.2', 'libtalloc.so');
  copier('lib/libandroid-shmem.so', 'libandroid-shmem.so');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`  ✓ ${abi}`);
}

(async () => {
  console.log('Préparation du mini-Linux (PRoot) pour le Terminal…');
  let reussi = 0;
  for (const [arch, abi] of Object.entries(ARCHS)) {
    try {
      await preparer(arch, abi);
      reussi++;
    } catch (e) {
      console.warn(`  ✗ ${abi} : ${e.message}`);
    }
  }
  if (!reussi) console.warn('PRoot non téléchargé : l’onglet Linux du Terminal sera indisponible dans cet APK.');
})();
