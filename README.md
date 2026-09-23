<p align="center"><img src="assets/icon.png" alt="Logo de Marceau" width="160"></p>

# Marceau

Application mobile **open source** de gestion de tâches pour **Android** et **iOS**,
construite avec [Expo](https://expo.dev) et React Native.

## Fonctionnalités

- Ajouter, cocher et supprimer des tâches
- Filtres : toutes / à faire / terminées
- Effacer d'un coup les tâches terminées
- Sauvegarde locale sur le téléphone (aucun compte, aucune donnée envoyée sur Internet)
- Thème automatique : jour gris mat avec écriture noire, nuit noire avec écriture blanche, boutons orange
- Interface en français, accessible (lecteurs d'écran)
- **Assistant IA gratuit** : décris un objectif, l'IA le découpe en tâches
- **Chat** : jase avec des IA en 3 modes (Discussion, Écriture, Sujet), réponses en direct, discussions sauvegardées
- **Codex** : crée des projets de code avec l'IA — les fichiers proposés s'enregistrent dans le projet, se modifient, se copient et se partagent

## Assistant IA

L'application s'ouvre sur le **Chat**. Le menu **☰** en haut à gauche mène au Chat, à **Codex**, à **Projet** (les tâches, avec le bouton **✨ IA**) et aux **Paramètres**. L'IA se choisit dans les Paramètres ou avec la puce en haut à droite :

| Fournisseur | Coût | Clé | Où tourne l'IA |
|---|---|---|---|
| [OpenCode Zen](https://opencode.ai/docs/zen/) | Modèles gratuits (`big-pickle`, `nemotron-3.5-lightning-free`…) | Gratuite, sur [opencode.ai/auth](https://opencode.ai/auth) | En ligne |
| [Ollama](https://ollama.com) | Gratuit, modèles open source (Llama, Qwen, Gemma, Mistral) | Aucune | Sur votre ordinateur |
| [Claude (Anthropic)](https://console.anthropic.com) | Payant à l'usage | Votre clé API Anthropic | En ligne |
| [OpenAI (Codex)](https://platform.openai.com) | Payant à l'usage | Votre clé API OpenAI | En ligne |

Le bouton « Charger la liste des modèles du serveur » affiche les modèles disponibles à jour.

Pour Ollama : lancez `OLLAMA_HOST=0.0.0.0 ollama serve`, téléchargez un modèle
(`ollama pull llama3.2`) et mettez l'adresse IP de l'ordinateur dans les réglages
(ex. `http://192.168.1.10:11434/v1`). Le téléphone doit être sur le même Wi-Fi.

Chaque clé API est gardée dans le coffre sécurisé du téléphone. Avec les modèles gratuits
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

Ensuite : onglet *Actions* → « Construire l'APK Android » → *Run workflow*. L'APK est
téléchargeable dans les *artifacts* de l'exécution. Pousser un tag `v*` (ex. `v1.0.0`)
construit aussi l'APK et le joint à la version GitHub. La clé de signature est créée et
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
