# ADR-005 — Stockage local des données

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

L'annuaire (entités, pseudonymes, historique complet des alias — M-02,
M-09) et la configuration (sites autorisés M-01, format de pseudonyme
M-10...) doivent être persistés **entièrement en local**, sans aucun appel
réseau vers un serveur applicatif : c'est une contrainte non négociable du
projet (données métier finance sensibles, voir [private/README.md](../../private/README.md)).

Une extension Chrome dispose de deux mécanismes de stockage local
pertinents ici : `chrome.storage.local` et IndexedDB.

## Options considérées

| Option | Avantages | Inconvénients |
|--------|-----------|----------------|
| `chrome.storage.local` | API simple (get/set par clé), accessible directement depuis content scripts, background et pages d'options sans code additionnel, quota par défaut 10 Mo (extensible avec la permission `unlimitedStorage`) | Pas de moteur de requête/filtrage natif : le filtrage se fait en mémoire côté JS après lecture |
| IndexedDB | Requêtes indexées, plus adapté à de gros volumes structurés | API plus verbeuse (ou nécessite une lib comme idb), complexité inutile pour le volume de données attendu (annuaire personnel, pas une base massive) |

## Décision

Utiliser **`chrome.storage.local`**, avec la permission `unlimitedStorage`
déclarée dès le départ pour éviter toute limite de quota sur l'historique
des alias (M-09) qui grandit dans le temps.

Structure retenue (clés au niveau racine du storage) :

- `fogbank.config` — configuration globale (caractère déclencheur, format
  de pseudonyme par défaut — voir ADR-001, ADR-002)
- `fogbank.sites` — tableau des sites autorisés et leur configuration
  (durée de vie du pseudonyme par site — M-01, M-08)
- `fogbank.annuaire` — tableau des entités (personne/organisation/lieu/projet),
  chacune avec son alias actif et son historique complet d'alias (M-02, M-09)

Le filtrage/recherche (ex: retrouver une entité par nom ou par pseudonyme)
se fait en mémoire côté JS après chargement, ce qui est largement suffisant
pour un annuaire de taille personnelle/équipe.

## Conséquences

- Pas de dépendance externe ni de bundler nécessaire pour la couche de
  stockage : l'API `chrome.storage.local` est native.
- Migration possible vers IndexedDB plus tard si le volume de données le
  justifie réellement — non anticipée maintenant (pas de sur-ingénierie).
- La permission `unlimitedStorage` doit être déclarée dans
  `src/manifest.json`.
- Le contenu de `chrome.storage.local` reste local à l'installation
  Chrome de l'utilisateur : aucune synchronisation cloud (à la différence
  de `chrome.storage.sync`, écarté volontairement pour cette raison).
