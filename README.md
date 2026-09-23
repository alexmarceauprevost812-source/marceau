<p align="center"><img src="assets/icon.png" alt="Logo de Marceau" width="160"></p>

# Marceau

Application mobile **open source** de gestion de tâches pour **Android** et **iOS**,
construite avec [Expo](https://expo.dev) et React Native.

## Fonctionnalités

- Ajouter, cocher et supprimer des tâches
- Filtres : toutes / à faire / terminées
- Effacer d'un coup les tâches terminées
- Sauvegarde locale sur le téléphone (aucun compte, aucune donnée envoyée sur Internet)
- Thème : jour gris mat avec écriture noire, nuit noire avec écriture blanche ; automatique ou forcé, et couleur des boutons au choix (orange, bleu, vert, violet, rose) dans **Préférences**
- **Rappels** : touche ⏰ à côté d'une tâche pour recevoir une notification à l'heure choisie
- **Lecture à voix haute** : « 🔊 Écouter » sous chaque réponse de l'IA (voix française, vitesse réglable)
- **Verrou** : empreinte, visage ou code du téléphone pour ouvrir l'app (dans Préférences)
- Interface en français, accessible (lecteurs d'écran)
- **Assistant IA gratuit** : décris un objectif, l'IA le découpe en tâches
- **Chat** : jase avec des IA en 3 modes (Discussion, Écriture, Sujet), écriture fluide en direct, discussions sauvegardées
- **Bouton +** (Chat et Codex) : envoie des photos, des captures, des PDF ou des fichiers texte/code ; l'IA les voit, les résume et les modifie
- **Studio** : les pages HTML créées par l'IA s'affichent en direct dans l'appli (▶ Studio)
- **Codex** : projets de code avec coloration syntaxique ; importe un dépôt GitHub, scanne tout le projet, corrige les bugs ; fonctionne avec ta clé Claude (Anthropic) par défaut
  - Explorateur comme dans un éditeur : dossiers repliables, fichiers qui s'ouvrent en panneaux, numéros de ligne, modification directe
  - Blocs de code repliables dans la discussion, avec les changements (+ / −) par rapport au projet
  - **GitHub en lecture et écriture** avec ton jeton : liste de tes dépôts (même privés), import complet, « Tirer » pour mettre à jour, « Pousser » pour faire un commit + push (sur la branche ou une nouvelle), ou « Publier » un projet dans un nouveau dépôt

## Assistant IA

L'application s'ouvre sur le **Chat**. Le bouton en haut à droite ouvre le **Bureau**, qui montre toutes les applications (elles s'ajoutent dans `src/bureau/applications.ts`). Le menu **☰** en haut à gauche mène au Chat, à **Codex**, à **Projet** (les tâches, avec le bouton **✨ IA**) et aux **Paramètres**. L'IA se choisit dans les Paramètres ou avec la puce en haut à droite :

| Fournisseur | Coût | Clé | Où tourne l'IA |
|---|---|---|---|
| [OpenCode Zen](https://opencode.ai/docs/zen/) | Modèles gratuits (`big-pickle`, `nemotron-3.5-lightning-free`…) | Gratuite, sur [opencode.ai/auth](https://opencode.ai/auth) | En ligne |
| [Ollama](https://ollama.com) | Gratuit, modèles open source (Llama, Qwen, Gemma, Mistral) | Aucune | Sur votre ordinateur |
| [Claude (Anthropic)](https://console.anthropic.com) | Payant à l'usage | Votre clé API Anthropic | En ligne |
| [OpenAI (Codex)](https://platform.openai.com) | Payant à l'usage | Votre clé API OpenAI | En ligne |

Le bouton « Charger la liste des modèles du serveur » affiche les modèles disponibles à jour.
Le Chat et le Codex ont chacun leur IA : par défaut OpenCode Zen (gratuit) pour le Chat et Claude pour le Codex.
Avec Claude, le contexte du projet est mis en cache (moins cher quand on pose plusieurs questions).

La vision (images) et les PDF dépendent du modèle : Claude et GPT les lisent ; beaucoup de modèles gratuits ne lisent que le texte.

Pour Ollama : lancez `OLLAMA_HOST=0.0.0.0 ollama serve`, téléchargez un modèle
(`ollama pull llama3.2`) et mettez l'adresse IP de l'ordinateur dans les réglages
(ex. `http://192.168.1.10:11434/v1`). Le téléphone doit être sur le même Wi-Fi.

Chaque clé API est gardée dans le coffre sécurisé du téléphone.

Pour GitHub, crée un jeton personnel (Réglages IA → Codex → « Créer un jeton ») :
un jeton *classic* avec la case `repo`, ou un jeton *fine-grained* avec « Contents : Read and write ». Avec les modèles gratuits
d'OpenCode Zen, vos requêtes peuvent servir à améliorer ces modèles ; avec Ollama, rien
ne quitte votre réseau.

## Essayer l'application

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
git clone https://github.com/alexmarceauprevost812-source/marceau.git
cd marceau
npm install
npm start
```

Installez ensuite **Expo Go** sur votre téléphone
([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) ·
[iOS](https://apps.apple.com/app/expo-go/id982107779)) et scannez le QR code affiché
dans le terminal.

## Construire l'application (APK / IPA)

**Avec GitHub Actions** (APK Android, gratuit, signé par EAS). Configuration à faire une fois :

1. `npx eas-cli login` puis `npx eas-cli init` (ajoute l'identifiant du projet EAS dans
   `app.json`) et commitez `app.json`.
2. Créez un jeton sur [expo.dev](https://expo.dev/settings/access-tokens) et ajoutez-le
   au dépôt comme secret `EXPO_TOKEN` (*Settings → Secrets and variables → Actions*).

Ensuite, **chaque déploiement** (push sur `main` ou sur la branche de travail) construit
un nouvel APK et le publie comme version GitHub `build-N` (on peut aussi le lancer à la
main : onglet *Actions* → « Construire l'APK Android » → *Run workflow*). L'application
installée vérifie cette version au démarrage : s'il y en a une plus récente, elle propose
**Installer**, télécharge l'APK et Android demande de confirmer l'installation. On peut
aussi vérifier depuis le **Bureau** (bouton en haut à droite) → *Mise à jour*. La clé de signature est créée et
conservée par EAS au premier build : les APK restent compatibles entre eux et avec les
builds EAS.

**Avec [EAS Build](https://docs.expo.dev/build/introduction/)** (profils définis dans `eas.json`) :

```bash
npx eas-cli@latest build --platform android --profile apk          # APK à installer directement
npx eas-cli@latest build --platform android --profile production   # AAB pour Google Play
npx eas-cli@latest build --platform ios --profile production       # iOS
```

## Structure du projet

```
App.tsx                       Écran principal
src/components/ElementTache   Ligne d'une tâche
src/ecrans/                   Écrans : Tâches, Chat, Codex, Réglages IA
src/components/AssistantIA    Assistant IA des tâches
src/ui/Discussion.tsx         Fil de discussion avec réponses en direct
src/ui/Markdown.tsx           Affichage du Markdown et des blocs de code
src/ui/Coloration.tsx         Coloration syntaxique du code
src/ui/Studio.tsx             Aperçu en direct des pages HTML
src/ia/pieces.ts              Photos et fichiers joints (bouton +)
src/ia/github.ts              GitHub : import, dépôts, commit + push
src/ui/Explorateur.tsx        Explorateur de fichiers du Codex (panneaux repliables)
src/ecrans/EnvoiGithub.tsx    Écran d'envoi sur GitHub
src/ia/                       Fournisseurs d'IA, réglages, appels (OpenAI et Anthropic)
src/hooks/useTaches.ts        État des tâches + sauvegarde (AsyncStorage)
src/theme.ts                  Couleurs clair / sombre
src/types.ts                  Types partagés
```

## Contribuer

Les contributions sont les bienvenues ! Ouvrez une *issue* pour proposer une idée ou
signaler un bug, ou envoyez une *pull request*. Avant de proposer une modification :

```bash
npm run typecheck
```

## Licence

Distribué sous licence [MIT](LICENSE) : vous pouvez utiliser, modifier et redistribuer
librement ce logiciel.
