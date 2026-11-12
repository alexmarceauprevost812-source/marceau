# Mission pour Claude Code : un seul APK Marceau, avec le terminal LexOS et l'IA locale

À lire en entier avant de toucher au code. Écris à Alex en **français simple** (québécois, sans jargon).
Alex développe seul, avec peu d'expérience du code : il compte sur toi pour implémenter, **tester** et lui dire
clairement ce qui marche et ce qui ne marche pas.

## Le but

Un **seul APK** (`org.marceau.app`) :

1. **Marceau** reste l'application principale (Chat, Codex, tâches, agenda…).
2. Le **terminal LexOS** (fork de Termux de l'étape 2) devient le terminal de Marceau :
   « comme Termux, mais la version qu'on a construite ».
3. **L'IA locale** : Marceau charge des modèles `.gguf` sur le téléphone, dans le Chat et dans Codex.

## Où on en est (honnêtement)

- **Dépôt `marceau`, branche `lexos-gguf-terminal`** : le support des modèles `.gguf` est écrit (nouveau fournisseur
  « Modèle sur le téléphone (.gguf) » avec llama.rn, téléchargement en un clic depuis le catalogue Ollama, lien
  `.gguf`, import de fichier, dossier partagé `Models`). Vérifié : `npx tsc --noEmit` passe, les paquets JS Android
  et web se construisent. **Jamais essayé sur un téléphone** : ni le téléchargement Ollama, ni le chargement du modèle.
- **Dépôt `Terminal-LexOS-pro-apk`, branche `etape-2-lexos-terminal`** (dossier `lexos-terminal/`) : le terminal a
  été *construit* mais **jamais vraiment utilisé**. Son bootstrap (shell, `apt`, paquets) n'a **jamais été
  compilé** : sans lui, l'APK s'installe mais n'est pas utilisable. Lis `lexos-terminal/docs/BOOTSTRAP.md`.
- **Plan et pièges** : `docs/PLAN-TERMINAL-LEXOS.md` (sur la branche `lexos-gguf-terminal`). Lis-le avant tout.
- Le terminal actuel de Marceau (`modules/marceau-terminal`, `src/terminal/`, `TERMINAL.md`) fonctionne déjà :
  téléphone, Kali dans PRoot, Termux (pont), SSH. **Ne le casse pas.**

## Les pièges déjà identifiés

1. **Bootstrap** : compilé pour un préfixe fixe `/data/data/<paquet>/files/usr`. Pour Marceau, il faut
   `org.marceau.app` (pas `com.termux`, pas `com.lexos.terminal`). Commandes dans `docs/PLAN-TERMINAL-LEXOS.md`.
   Plusieurs heures, Docker, environ 60 Go : vérifie d'abord que la machine d'Alex peut le faire.
2. **Exécution depuis `files/`** : bloquée dès qu'une appli cible l'API 29 ou plus. Termux cible l'API 28
   (`lexos-terminal/gradle.properties`). Pour le moteur Termux dans Marceau, il faut donc `targetSdkVersion: 28`
   (plugin `expo-build-properties`) : à tester sérieusement (notifications, alarmes, plein écran, mise à jour par-dessus).
3. **`android:sharedUserId`** du fork : à retirer (impossible à ajouter à une appli déjà installée).
4. **Licence** : le code de `lexos-terminal` est GPLv3 ; l'APK entier passera en GPLv3. Mets à jour `LICENSE`,
   `LICENCES-TIERCES.md`, `scripts/licences.js`.
5. **Expo (AGENTS.md)** : ne modifie jamais `android/` à la main ; passe par `app.json` et des plugins de config.
   Lis la doc versionnée d'Expo SDK 57 avant de toucher à une API Expo ou EAS.

## La décision d'Alex (à confirmer en une seule question au début)

- **Voie A (par défaut, c'est ce qu'Alex a demandé)** : greffer le moteur Termux de l'étape 2 dans Marceau,
  Marceau cible l'API 28.
- **Voie B (repli)** : garder PRoot (déjà dans Marceau) et y mettre l'interface et les extras LexOS (couleurs,
  volets divisés, assistant `aide`), sans moteur Termux ni changement d'API.

Fais d'abord un **petit essai de faisabilité** de la voie A (Marceau à l'API 28 : l'appli s'installe par-dessus
l'ancienne, tout marche encore ; un binaire du bootstrap s'exécute depuis `files/`). S'il échoue, propose la voie B.

## Les étapes, dans l'ordre

1. **Valider l'existant sur le vrai téléphone (A55 ou S25 Ultra).** Construire l'APK de la branche
   `lexos-gguf-terminal` (workflow GitHub « Construire l'APK Android » lancé sur cette branche, ou `eas build`
   en local). Tester : Réglages → IA → « Modèle sur le téléphone (.gguf) » ; télécharger `qwen2.5-coder:1.5b` en un
   clic ; un message dans le Chat ; un message dans Codex ; ajouter un `.gguf` copié dans `/storage/emulated/0/Models` ;
   coller un lien `http://IP-DE-L-ORDI:8000/x.gguf` (serveur `python3 -m http.server`). **Corriger ce qui casse**
   (le téléchargement Ollama passe par `registry.ollama.ai` : jamais testé en vrai).
2. **Compiler le bootstrap pour `org.marceau.app`** (en tâche de fond, c'est long). Le publier comme fichier d'une
   version GitHub du dépôt `marceau` (`bootstrap-aarch64.zip`).
3. **Greffer le terminal** : module Expo `modules/lexos-terminal` (terminal-emulator, terminal-view, termux-shared,
   classes de `app/`, JNI), nom de paquet `org.marceau.app` dans `TermuxConstants`, manifeste par plugin de config,
   script `eas-build-post-install` qui télécharge le bootstrap, entrée « LexOS » dans le menu Terminal de Marceau.
4. **Tester le terminal pour de vrai sur le téléphone** (la liste de `lexos-terminal/docs/BOOTSTRAP.md`, avec
   `org.marceau.app`) : prompt `bash`, `echo $PREFIX`, `pkg update`, `pkg install nano`, `python --version`,
   `git --version`, `ssh -V`, volets divisés, couleurs LexOS.
5. **Relier le terminal et l'IA locale** : les `.gguf` du dossier `Models` visibles depuis le terminal
   (`termux-setup-storage`), `llama-server` ou l'assistant `aide` qui les utilisent.
6. **Licences et documentation** (voir « piège 4 » et `TERMINAL.md`).

## Règles de travail

- Travaille sur une **branche** (pars de `lexos-gguf-terminal`). Ne touche pas à `main` sans l'accord d'Alex.
- Petits commits, en français, qui disent ce qui a changé.
- Avant de dire qu'une étape est finie : `npm run typecheck`, `npx expo-doctor`, et **un essai sur le téléphone**.
  Ne dis jamais « ça marche » sans l'avoir essayé ; dis ce qui est testé et ce qui ne l'est pas.
- Chat, Codex, Kali (PRoot), SSH et les mises à jour par-dessus l'ancienne installation doivent **continuer à marcher**
  (même signature, même nom de paquet).
- Si une décision peut casser l'appli d'Alex (API cible, signature, nom de paquet), demande-lui d'abord.
- Quand tu as fini, résume en quelques phrases : ce qui marche sur le téléphone, ce qui reste, la prochaine étape.
