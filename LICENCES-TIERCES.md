# Licences des logiciels tiers

Marceau est distribué sous licence **MIT** (voir [LICENSE](LICENSE)).
L'APK contient aussi les logiciels libres suivants. La liste complète, avec les textes des licences,
est aussi dans l'appli : **Bureau → Licences**.

## Composants natifs (Terminal)

| Composant | Version | Licence | Texte | Source |
| --- | --- | --- | --- | --- |
| PRoot (fork Termux) | 5.1.107.94 | GPL-2.0-or-later | [licences/proot.txt](licences/proot.txt) | https://github.com/termux/proot |
| talloc | 2.4.3 | LGPL-3.0-or-later | [licences/talloc-LGPL-3.0.txt](licences/talloc-LGPL-3.0.txt), [licences/GPL-3.0.txt](licences/GPL-3.0.txt) | https://talloc.samba.org |
| libandroid-shmem | 0.7 | BSD-3-Clause | [licences/libandroid-shmem.txt](licences/libandroid-shmem.txt) | https://github.com/termux/libandroid-shmem |
| JSch (fork mwiede) | 0.2.20 | BSD-3-Clause | [licences/jsch.txt](licences/jsch.txt) | https://github.com/mwiede/jsch |
| Bouncy Castle | 1.78.1 | MIT | [licences/bouncycastle.txt](licences/bouncycastle.txt) | https://www.bouncycastle.org |
| xterm.js + addon-fit | voir package.json | MIT | [licences/xterm.txt](licences/xterm.txt) | https://github.com/xtermjs/xterm.js |

PRoot, talloc et libandroid-shmem sont **compilés à partir de leur code source**, sans modification, par
[scripts/construire-linux.sh](scripts/construire-linux.sh). Leur code source exact est publié avec chaque
version de l'APK sur GitHub (`marceau-sources-linux.tar.gz`), comme l'exigent la GPL et la LGPL.

Alpine Linux n'est pas inclus dans l'APK : le téléphone le télécharge directement depuis les serveurs d'Alpine.

## Bibliothèques JavaScript

React Native, Expo et leurs dépendances (environ 490 paquets) : licences libres (surtout MIT, ISC,
Apache-2.0, BSD). La liste exacte est générée à chaque build par [scripts/licences.js](scripts/licences.js)
et affichée dans l'appli.
