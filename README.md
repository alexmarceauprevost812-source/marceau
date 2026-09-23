<p align="center"><img src="assets/icon.png" alt="Logo de Marceau" width="160"></p>

# Marceau

Application mobile **open source** de gestion de tâches pour **Android** et **iOS**,
construite avec [Expo](https://expo.dev) et React Native.

## Fonctionnalités

- Ajouter, cocher et supprimer des tâches
- Filtres : toutes / à faire / terminées
- Effacer d'un coup les tâches terminées
- Sauvegarde locale sur le téléphone (aucun compte, aucune donnée envoyée sur Internet)
- Thème clair et sombre automatique
- Interface en français, accessible (lecteurs d'écran)

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

**Avec GitHub Actions** (APK Android, gratuit) : ouvrez l'onglet *Actions* du dépôt,
choisissez « Construire l'APK Android » puis *Run workflow*. L'APK est téléchargeable
dans les *artifacts* de l'exécution. Pousser un tag `v*` (ex. `v1.0.0`) construit aussi
l'APK et le joint automatiquement à la version GitHub.

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
