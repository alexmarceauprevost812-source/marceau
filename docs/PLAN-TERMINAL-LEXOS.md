# Plan : le terminal LexOS (étape 2) dans l'APK Marceau

**But.** Un seul APK : Marceau reste l'application principale, et son terminal devient le terminal LexOS
(le fork de Termux de l'étape 2), « comme Termux, mais la version qu'on a construite ».

Source du terminal : `Terminal-LexOS-pro-apk`, branche `etape-2-lexos-terminal`, dossier `lexos-terminal/`
(fork de `termux/termux-app` au commit `8629e63`, modifications visibles avec `git diff 2d9444b -- lexos-terminal/`).

> Statut : **pas encore fait.** Ce document explique pourquoi, et ce qu'il faut décider et faire.
> Je n'ai pas pu compiler d'APK dans l'environnement où il a été écrit (pas d'accès à Gradle / au SDK Android).
> Rien de natif n'a donc été greffé « à l'aveugle » : un échec n'apparaîtrait qu'au build EAS, sans moyen de le déboguer.

## Ce que le fork de l'étape 2 est et n'est pas

- C'est une **application Android complète** (Java, JNI en C, paquet `com.lexos.terminal`), sous **GPLv3**.
- Son **bootstrap** (le shell, `apt`, les paquets) est compilé pour un préfixe fixe
  `/data/data/<nom du paquet>/files/usr`. Tant qu'il n'est pas recompilé pour le bon nom de paquet, `pkg install`
  et le shell ne marchent pas (voir `lexos-terminal/docs/BOOTSTRAP.md` : ces commandes n'ont jamais été exécutées).

## Trois points durs à régler pour le mettre dans Marceau

### 1. Le bootstrap doit être refait pour `org.marceau.app`

Dans Marceau, le nom du paquet est `org.marceau.app`, pas `com.lexos.terminal`. Il faut donc un bootstrap pour
`/data/data/org.marceau.app/files/usr`. **Ne perds pas de temps à compiler celui de `com.lexos.terminal`** si tu vas
fusionner : ce serait un deuxième bootstrap inutile.

Sur ton PC Ubuntu (Docker, environ 60 Go libres, plusieurs heures) :

```bash
git clone https://github.com/termux/termux-packages.git
cd termux-packages
git checkout 9cfc799
sed -i 's|^TERMUX_APP__PACKAGE_NAME="com.termux"|TERMUX_APP__PACKAGE_NAME="org.marceau.app"|' scripts/properties.sh
grep -n '^TERMUX_APP__PACKAGE_NAME=' scripts/properties.sh     # doit afficher org.marceau.app
# NE PAS toucher TERMUX_REPO_APP__PACKAGE_NAME : il reste com.termux (dépôt officiel).
./scripts/run-docker.sh ./clean.sh
./scripts/run-docker.sh ./scripts/build-bootstraps.sh --architectures aarch64 --add openssh,git,python &> build.log
ls -l bootstrap-aarch64.zip
```

Vérification (aucune ligne ne doit sortir de la première commande) :

```bash
mkdir /tmp/bs && cd /tmp/bs && unzip -q ~/termux-packages/bootstrap-aarch64.zip
grep -rl "/data/data/com.termux" . | head
grep -rl "/data/data/org.marceau.app" . | head -3
```

Ensuite, publier `bootstrap-aarch64.zip` comme fichier d'une version GitHub de ce dépôt : le build EAS le
téléchargera (comme `scripts/construire-linux.sh` le fait pour PRoot), sans que le zip soit dans git.

### 2. Android bloque l'exécution de programmes rangés dans les données de l'appli

Depuis Android 10, une appli qui cible l'API 29 ou plus **ne peut plus exécuter** un fichier de son dossier
`files/`. Termux contourne ça en ciblant l'**API 28** (`targetSdkVersion=28` dans `lexos-terminal/gradle.properties`).
Marceau cible aujourd'hui l'API de Expo (35 ou plus), où le bootstrap de Termux ne démarrerait pas.

Deux voies :

- **A. Marceau cible l'API 28** (réglage `targetSdkVersion: 28` dans `expo-build-properties`, `app.json`).
  C'est ce que fait Termux. À tester : notifications, alarmes exactes, plein écran, comportement des anciens réglages.
  L'APK reste installable (hors Google Play, que tu n'utilises pas).
- **B. Garder l'approche actuelle de Marceau** : PRoot dans `jniLibs` (déjà là pour Kali) fait tourner un système
  Linux complet sans toucher à l'API cible. On y mettrait l'interface et les extras LexOS (couleurs, volets divisés,
  assistant `aide`) plutôt que le moteur Termux.

Je recommande de décider **A ou B avant** de compiler le bootstrap.

### 3. La licence de l'APK passe en GPLv3

Le code de `lexos-terminal` est sous GPLv3. Une fois dans le même APK, l'ensemble doit être distribué sous GPLv3
(code source complet disponible, textes de licence inclus). Marceau est aujourd'hui sous MIT (PRoot, lui, est un
programme séparé). Il faudra mettre à jour `LICENSE`, `LICENCES-TIERCES.md`, `scripts/licences.js` et
`lexos-terminal/LEXOS-LICENCES.md` en conséquence (voir ce dernier pour le point GPLv2/GPLv3 à faire valider).

## Étapes de l'intégration (voie A)

1. **Module Expo `modules/lexos-terminal`** : copier `terminal-emulator/`, `terminal-view/`, `termux-shared/` et
   les classes de `app/` du fork (le dossier `app/src/main/cpp` pour le JNI et le bootstrap embarqué).
   Brancher les sous-projets Gradle avec un plugin de config (`withSettingsGradle` / `withAppBuildGradle`) :
   on ne modifie jamais `android/` à la main (AGENTS.md).
2. **Nom du paquet** : mettre `TERMUX_PACKAGE_NAME = "org.marceau.app"` dans `TermuxConstants.java` et dans les
   `manifestPlaceholders`. **Retirer `android:sharedUserId`** du manifeste (impossible à ajouter sur une appli déjà
   installée, et inutile ici).
3. **Manifeste** : ajouter par plugin de config les activités, services (`TermuxService`, `RunCommandService`),
   fournisseur de documents, récepteurs et permissions du fork (voir `lexos-terminal/app/src/main/AndroidManifest.xml`).
4. **Bootstrap** : script `eas-build-post-install` qui télécharge `bootstrap-aarch64.zip` (version GitHub) dans le
   module avant la compilation, et qui échoue clairement s'il est absent.
5. **Entrée dans Marceau** : dans le menu Terminal, un onglet « LexOS » qui ouvre `TermuxActivity` (petite
   fonction native `ouvrirTerminalLexos()` dans le module). Les onglets existants (téléphone, Kali PRoot, SSH) restent.
6. **Mise à jour** : le nom de l'APK et la clé de signature de Marceau ne changent pas ; les installations existantes
   se mettent à jour par-dessus (si `sharedUserId` n'a pas été ajouté).

## À vérifier sur le téléphone après le premier build

Reprendre la liste de `lexos-terminal/docs/BOOTSTRAP.md` (« À vérifier sur le téléphone »), en remplaçant
`com.lexos.terminal` par `org.marceau.app` :

1. L'appli s'installe par-dessus l'ancienne Marceau et s'ouvre sans planter.
2. Premier lancement du terminal LexOS : l'installation du bootstrap se termine, un prompt `bash` apparaît.
3. `echo $PREFIX` affiche `/data/data/org.marceau.app/files/usr`.
4. `pkg update` puis `pkg install nano` sans erreur de signature ni de dépôt.
5. `python --version`, `git --version`, `ssh -V`.
6. Les modèles `.gguf` du dossier partagé `Models` sont visibles depuis le terminal (`termux-setup-storage`)
   pour `llama-server` et l'assistant `aide`.
7. Le Chat et le Codex de Marceau répondent toujours (fournisseurs Ollama, Claude, `.gguf` sur le téléphone).
