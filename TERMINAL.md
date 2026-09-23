# Terminal de Marceau

L'écran **Terminal** (menu ☰ → `>_`, ou Bureau → Terminal) a quatre onglets :

- **Téléphone** : le shell d'Android (`/system/bin/sh`), sur un vrai pseudo-terminal. Dossier de travail : `maison`.
- **Linux** : Alpine Linux intégré, lancé avec PRoot. Bouton « Installer Linux » (~4 Mo), puis `apk add python3 git nodejs nano`. Les fichiers de l'onglet Téléphone sont dans `/telephone`.
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
| `scripts/preparer-linux.js` | Télécharge PRoot depuis les paquets Termux pendant le build (`eas-build-post-install`) |

Android n'exécute que les programmes livrés dans l'APK : PRoot est donc placé dans `jniLibs` sous le nom
`libproot.so`, et `useLegacyPackaging` (app.json) garde ces fichiers extraits sur le téléphone.
Si PRoot ne peut pas être téléchargé, l'APK se construit quand même : l'onglet Linux l'indique.

Test à la main du téléchargement de PRoot : `npm run preparer-linux`.
