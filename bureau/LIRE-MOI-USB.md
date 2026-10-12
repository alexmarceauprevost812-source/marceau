# Marceau sur une clé USB

1. Extraire tout le paquet dans un dossier `Marceau` sur la clé.
2. Lancer `Marceau-USB` (Linux/macOS) ou `Marceau-USB.exe` (Windows). Sous Linux, rendre le fichier exécutable si nécessaire : `chmod +x Marceau-USB`.
3. L’interface complète de Marceau s’ouvre dans le navigateur à l’adresse locale `http://127.0.0.1:32178`.
4. Dans **Réglages IA**, choisir **IA embarquée (hors ligne)** pour le Chat ou le Codex.
5. Choisir le petit modèle (1,84 Go) ou le modèle 4B (2,50 Go), puis **Installer et activer**. Internet est nécessaire pour ce téléchargement seulement.
6. Après installation, utiliser l’IA sans Internet. Les modèles sont dans `modeles/` et les projets et discussions dans `donnees/`, à côté du programme. Une clé accessible en écriture est nécessaire.
7. Garder la fenêtre du programme ouverte pendant l’utilisation. La fermer arrête le moteur. Fermer le programme avant de retirer la clé.

Les deux espaces peuvent partager le même modèle. Un seul modèle est chargé à la fois. La première réponse peut être plus lente lors du chargement. Prévoir environ 8 Go de RAM pour les PC, davantage si d’autres programmes sont ouverts ; les performances doivent être vérifiées sur chaque machine. Un processeur 64 bits et un système compatible avec l’exécutable sont nécessaires.

L’accès à Claude/OpenAI par clé et l’ouverture de ChatGPT restent des options en ligne. L’abonnement ChatGPT n’active pas l’API OpenAI. L’utilisation de l’abonnement dans Marceau n’est pas intégrée.

Les clés API web restent dans le navigateur de ce PC, pas dans les fichiers de la clé. Elles ne sont pas transmises à l’IA locale. Les projets et discussions locaux sont stockés sur la clé, sans chiffrement.

Ce paquet est une version de test, sans signature de distribution. L’APK « Marceau Local » est également une version de test séparée de Marceau déjà installé. Il embarque le moteur ; les poids sont téléchargés ensuite. Le mode Discussion de Codex fonctionne avec l’IA locale ; le mode « Agent Claude » conserve son fournisseur Anthropic.
