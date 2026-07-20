# ADR-004 — Portée des permissions et modèle de sites

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

M-01 prévoyait initialement un mode liste blanche **et** liste noire pour
les sites sur lesquels l'extension s'active. Techniquement, un mode liste
noire ("actif partout sauf...") nécessite de déclarer la permission d'hôte
`<all_urls>` dès l'installation, ce qui déclenche l'affichage d'un
avertissement large côté Chrome ("Lire et modifier toutes vos données sur
tous les sites web") — peu cohérent avec un projet positionné sur la
confidentialité des données.

## Options considérées

| Option | Permissions | Remarque |
|--------|-------------|----------|
| Whitelist + blacklist, `<all_urls>` déclarée en dur | Large dès l'installation | Fidèle au M-01 initial, mais surface de confiance maximale demandée d'emblée |
| Whitelist uniquement, permission par site à la demande | Minimale, croît avec l'usage | Pas de mode blacklist |
| `<all_urls>` déclarée en `optional_host_permissions`, demandée seulement si blacklist activée | Minimale par défaut, extensible | Complexité supplémentaire pour un mode secondaire |

## Décision

**Whitelist uniquement**, pas de mode liste noire.

- L'extension est **inactive sur tout site par défaut**.
- Une courte liste des grands sites IA connus (ChatGPT, Claude.ai, ...) est
  **pré-activée à l'installation** : ces domaines sont déclarés en
  `host_permissions` statiques dans le manifest (permission accordée à
  l'installation, sans étape supplémentaire).
- L'utilisateur peut **ajouter volontairement** d'autres sites depuis la
  page d'options (M-01) ; chaque ajout déclenche une demande de permission
  ciblée sur ce domaine via `chrome.permissions.request` (`optional_host_permissions`).
- Chaque site activé (pré-activé ou ajouté) a sa propre configuration
  (durée de vie du pseudonyme — M-08).

## Conséquences

- Aucune permission `<all_urls>` n'est jamais demandée : l'invite
  d'installation reste limitée aux domaines des grands sites IA pré-listés.
- Retrait de la notion de "liste noire" du périmètre fonctionnel (M-01
  mis à jour en conséquence dans [SPECS.md](../SPECS.md)).
- La liste des grands sites IA pré-activés (domaines exacts) est une donnée
  publique de configuration (pas de donnée métier), à maintenir dans le
  code source (`src/`), pas dans `private/`.
- Ajout d'un site par l'utilisateur implique un aller-retour avec l'API
  `chrome.permissions` côté page d'options — à détailler dans l'UC
  correspondant à M-01.
