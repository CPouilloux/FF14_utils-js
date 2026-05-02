# FF14_utils-js

## To start the app
```
npm install
npm start
```
Le serveur démarre sur le port 3000

## Mise à jour sans Git (pour les copies partagées)

Si tu as reçu le projet en zip et que tu as seulement Node.js installé, tu peux récupérer la dernière version sans installer Git :

1. Ouvre un terminal **dans le dossier du projet** (là où se trouve `package.json`).
2. Exécute :

```
npm run update
```

Sous Windows, tu peux aussi double-cliquer sur `update.bat` dans le dossier du projet.

Le script télécharge l’archive de la branche `main` du dépôt par défaut, met à jour les fichiers de l’application, **conserve** ton dossier `node_modules`, ton fichier `.env` (s’il existe) ainsi que `data-files/saved_searches.json` et `data-files/tracked_top_items.json`, puis lance `npm install` au cas où les dépendances auraient changé.

- **Autre dépôt GitHub (fork)** : variable d’environnement `FF14_UPDATE_REPO` au format `utilisateur/nom-du-depot` (branche `main`).
- **Dépôt GitHub privé** : GitHub ne fournit pas le zip sans authentification ; mets le dépôt en **public** pour que `npm run update` fonctionne, ou publie une archive (onglet *Releases*, ou fichier hébergé) et définis `FF14_UPDATE_ZIP` avec l’URL directe du fichier `.zip`.

### Côté personne qui maintient le projet

Tu continues à pousser sur GitHub comme d’habitude ; les autres n’ont plus besoin d’un nouveau zip à chaque changement, seulement de lancer `npm run update` de temps en temps (dépôt public ou URL `FF14_UPDATE_ZIP`).
