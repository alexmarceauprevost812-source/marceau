# Terminal de Marceau

L'écran **Terminal** (menu ☰ → `>_`, ou Bureau → Terminal) a quatre onglets :

- **Téléphone** : le shell d'Android (`/system/bin/sh`), sur un vrai pseudo-terminal. Dossier de travail : `maison`.
- **Linux** : le rootfs officiel **Kali NetHunter** (minimal), lancé avec PRoot. Bouton « Installer Linux » (quelques centaines de Mo, mieux vaut être en Wi-Fi), puis `apt install python3 git nodejs nano`. Les fichiers de l'onglet Téléphone sont dans `/telephone`.
- **Termux** : envoie les commandes à l'appli Termux (F-Droid). Prérequis dans Termux :
  `echo 'allow-external-apps = true' >> ~/.termux/termux.properties`, puis fermer et rouvrir Termux.
  Commandes non interactives seulement (ex. `pkg install -y python`) ; bouton « Ouvrir Termux » pour vim, htop…
- **Ordi (SSH)** : terminal vers un ordinateur. Sur Ubuntu : `sudo apt install openssh-server`, puis `hostname -I` pour l'adresse.
  Hors de la maison : Tailscale. Identifiants gardés dans le coffre sécurisé.

Le terminal ne fonctionne que dans l'APK Android (pas sur iOS, le web ni Expo Go).

## Comment c'est construit

| Fichier | Rôle |
| --- | --- |
| `modules/marceau-terminal/` | Module natif Expo (Kotlin + C) : PTY, PRoot, SSH (JSch), Termux |
| `modules/marceau-terminal/android/src/main/cpp/pty.c` | Crée le pseudo-terminal (fork + /dev/ptmx) |
| `modules/marceau-terminal/app.plugin.js` | Évite un conflit de fichiers entre JSch et Bouncy Castle |
| `src/terminal/` | Affichage (xterm.js dans une WebView), barre de touches, panneaux |
| `src/ecrans/EcranTerminal.tsx` | L'écran et ses onglets |
| `scripts/xterm-bundle.js` | Emballe xterm.js hors ligne (lancé après `npm install`) |
| `scripts/construire-linux.sh` | Compile PRoot, talloc et libandroid-shmem **à partir du code source** pendant le build (`eas-build-post-install`) |
| `scripts/licences.js` | Prépare la liste des licences affichée dans l'appli (Bureau → Licences) |
| `licences/` | Textes complets des licences des composants natifs |

Android n'exécute que les programmes livrés dans l'APK : PRoot est donc placé dans `jniLibs` sous le nom
`libproot.so`, et `useLegacyPackaging` (app.json) garde ces fichiers extraits sur le téléphone.
Si PRoot ne peut pas être compilé (pas de NDK, source introuvable), l'APK se construit quand même :
l'onglet Linux l'indique.

Compiler PRoot à la main (NDK Android requis) : `npm run preparer-linux`.

## Licences

Le code du Terminal (Kotlin, C, TypeScript) fait partie de Marceau : **MIT**.
Il inclut ou utilise ces logiciels libres :

| Composant | Licence | Comment il est inclus |
| --- | --- | --- |
| PRoot (fork Termux) 5.1.107.94 | GPL-2.0-or-later | Compilé depuis la source, programme séparé (`libproot.so`) |
| talloc 2.4.3 | LGPL-3.0-or-later | Compilé depuis la source, lié statiquement dans PRoot |
| libandroid-shmem 0.7 | BSD-3-Clause | Compilé depuis la source, lié statiquement dans PRoot |
| JSch (fork mwiede) 0.2.20 | BSD-3-Clause | Bibliothèque Java (Maven Central) |
| Bouncy Castle 1.78.1 | MIT | Bibliothèque Java (Maven Central) |
| xterm.js + addon-fit | MIT | Emballé dans l'appli (`scripts/xterm-bundle.js`) |
| XZ for Java | Domaine public (0BSD-like) | Bibliothèque Java (Maven Central), décompresse le rootfs Kali |
| Kali Linux (rootfs NetHunter) | Divers (libres) | **Non inclus** : téléchargé par le téléphone depuis les serveurs officiels de Kali |

PRoot est lancé comme un programme séparé : il ne change pas la licence de Marceau.

**Obligations GPL / LGPL.** Le code source exact de PRoot, talloc et libandroid-shmem (versions épinglées
par empreinte SHA-256) et le script de compilation sont publiés avec **chaque** version GitHub de l'APK
(fichier `marceau-sources-linux.tar.gz`). Pour le préparer à la main : `npm run sources-linux`.
Les textes complets des licences sont dans `licences/` et dans l'appli (Bureau → Licences).

Quand une version change, mettre à jour ensemble : `scripts/construire-linux.sh` (version + SHA-256),
`scripts/licences.js` et le tableau ci-dessus.
