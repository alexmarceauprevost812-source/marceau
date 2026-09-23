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

Avec [EAS Build](https://docs.expo.dev/build/introduction/) :

```bash
npx eas-cli@latest build --platform android   # ou ios
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
