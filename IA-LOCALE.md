# IA embarquée — Android et bureau

Le moteur Android `llama.rn` est intégré dans l’APK. Les modèles sont téléchargés séparément, une fois, ou importés depuis une clé USB. Le même fournisseur local est utilisable dans Chat et Codex (mode Discussion). Les images/PDF ne sont pas pris en charge par les modèles proposés ; l’application demande de les retirer au lieu de les ignorer.

## Modèles

- Qwen3 1.7B Q8_0 : 1 834 426 016 octets, source Qwen, Apache-2.0.
- Qwen3 4B Instruct 2507 Q4_K_M : 2 497 281 120 octets, conversion Unsloth, Apache-2.0.

Les URLs utilisent une révision immuable. Android vérifie la taille et l’en-tête GGUF ; le bureau vérifie aussi SHA-256 pendant le téléchargement. Une coupure permet une reprise explicite sur Android. La génération reste locale : CPU, 4 threads maximum, contexte 4 096 tokens, un seul modèle en mémoire. La compatibilité et la vitesse sur Samsung S25 Ultra doivent être validées sur appareil.

## Interface et données communes

Marceau Bureau utilise l’export web de l’interface existante, servi uniquement sur la boucle locale. Le moteur Python llama.cpp est inclus dans les paquets. Les requêtes locales exigent un jeton de session et l’hôte local attendu. Les modèles et données peuvent rester sur une clé USB. Le catalogue `bureau/modeles-locaux.json` est commun aux deux moteurs.

## Construire

Le workflow `ia-locale.yml` produit un APK autonome ARM64 de test et des exécutables PC pour les architectures des runners Linux/Windows/macOS. Il exporte l’interface une fois puis l’inclut dans chaque paquet PC. L’APK release inclut le JavaScript et utilise la signature de test générée par Expo ; le nom et l’identifiant sont distincts de la version EAS installée. Pour une mise à jour de production, utiliser le workflow EAS existant et ses clés de signature.

`llama.rn` est épinglé à 0.13.0-rc.7, actuellement une préversion ; une compilation et des tests de génération sur appareil restent nécessaires.

## Vérifications

- `npm run typecheck`
- `npm run test:local` : installation, réutilisation hors ligne, fichier tronqué, espace insuffisant, deux fichiers de modèles distincts.
- `npx expo lint` : configuration ajoutée ; le contrôle global révèle des erreurs de hooks déjà présentes dans des écrans existants. Les modules d’IA locale sont contrôlés séparément, sans désactiver les règles globales.
- `python -m unittest discover -s bureau -p 'test_*.py' -v` : stockage, modèles absents et accès HTTP local.
- `npx expo export --platform web --output-dir bureau/web`
- `npx expo prebuild --platform android --no-install`

La connexion d’un abonnement ChatGPT à Marceau nécessite l’accès partenaire officiel. Le bouton proposé ouvre ChatGPT séparément ; il ne simule pas une intégration d’abonnement.
