# Architecture cible — fogbank

Ce document décrit l'architecture technique retenue pour implémenter les
macro-UC de [SPECS.md](SPECS.md). Les décisions structurantes avec
alternatives sont détaillées dans les ADR (`docs/adr/`) ; ce document en
donne la vue d'ensemble assemblée.

## Principes directeurs

- **Tout local** : aucun backend applicatif, aucun appel réseau sortant
  hors des sites IA eux-mêmes. Persistance via `chrome.storage.local`
  ([ADR-005](adr/0005-stockage-local.md)).
- **Permissions minimales** : whitelist uniquement, pas d'accès large
  `<all_urls>` ([ADR-004](adr/0004-portee-permissions.md)).
- **Vanilla JS, pas de bundler** : les rares dépendances (ex: SheetJS pour
  Excel) sont vendored en `src/vendor/`, chargées par balise `<script>`.
- **Séparation code / données sensibles** : le code (`src/`) ne contient
  jamais de données réelles ; `private/` reste réservé au développement/tests
  (voir [private/README.md](../private/README.md)) et n'a aucun rapport
  avec le stockage runtime de l'extension chez l'utilisateur final (qui vit
  dans `chrome.storage.local`, propre à chaque installation).

## Composants de l'extension (Manifest V3)

```
src/
├── manifest.json
├── background/
│   └── background.js       # service worker
├── content/
│   ├── content.js           # point d'entrée injecté sur les sites autorisés
│   ├── mention-menu.js       # UI du menu déclenché par "&" (M-03/M-04/M-05)
│   └── site-adapters/        # un adaptateur par site IA (sélecteurs DOM spécifiques)
│       ├── chatgpt.js
│       ├── claude.js
│       └── generic.js        # fallback pour un site ajouté manuellement
├── options/                  # NOUVEAU — page de configuration complète
│   ├── options.html
│   ├── options.js
│   └── options.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── vendor/                   # NOUVEAU — dépendances tierces vendored
│   └── xlsx.full.min.js      # SheetJS CE, Apache-2.0 (voir ADR-006)
└── icons/
```

| Composant | Rôle | Macro-UC couverts |
|-----------|------|--------------------|
| `content/content.js` + `mention-menu.js` | Détecte `&`, affiche le menu, marque la mention (soulignement + tooltip) | M-03, M-04, M-05, M-11 |
| `content/site-adapters/*` | Abstraction des sélecteurs DOM propres à chaque site (champ de saisie, bouton d'envoi, zone de réponse) | M-01, M-06, M-07 |
| `background/background.js` | Cycle de vie de l'extension, `chrome.alarms` pour la rotation des pseudonymes, gestion des permissions de site à la demande | M-01, M-08 |
| `options/` | Gestion de l'annuaire (CRUD), configuration des sites, format de pseudonyme, historique, export/import Excel, outil de conversion manuelle | M-01, M-02, M-09, M-10, M-12, M-13 |
| `popup/` | Statut rapide (site actif ou non), raccourci vers la page d'options | — |
| `vendor/xlsx.full.min.js` | Lecture/écriture de fichiers `.xlsx` en local | M-13 |

La page d'options est déclarée en `open_in_tab: true` (onglet complet plutôt
que popover) : les écrans d'annuaire et d'historique sont tabulaires et
gagnent à disposer de tout l'espace d'un onglet.

### Adaptateurs de site

Chaque site autorisé (M-01) a des sélecteurs DOM différents pour son champ
de saisie, son bouton d'envoi et sa zone de réponse. Plutôt que du code
spécifique dispersé, chaque site (pré-activé ou ajouté manuellement) est
représenté par un adaptateur avec une interface commune :

```js
// Interface commune (JSDoc, pas de framework)
// {
//   matches(url): boolean
//   getInputField(): HTMLElement | null
//   getSendTrigger(): HTMLElement | null   // bouton ou raccourci d'envoi
//   getResponseContainer(): HTMLElement | null
// }
```

`generic.js` fournit une implémentation par défaut basée sur des
heuristiques (premier `textarea`/`contenteditable` visible, etc.) pour les
sites ajoutés manuellement sans adaptateur dédié.

## Modèle de données (`chrome.storage.local`)

Voir [ADR-005](adr/0005-stockage-local.md) pour la justification du choix
de stockage. Trois clés racine :

```js
// fogbank.config
{
  caractereDeclencheur: "&",              // voir ADR-001
  formatParDefaut: "court" | "etendu" | "opaque"  // voir ADR-002
}

// fogbank.sites[]
{
  id: string,
  domaine: string,                         // ex: "chat.openai.com"
  preActive: boolean,                      // true pour les grands sites IA (ADR-004)
  actif: boolean,
  dureeViePseudonyme: "1s" | "1t" | "1a" | "infini"   // M-08
}

// fogbank.annuaire[]
{
  id: string,
  type: "PER" | "ORG" | "LIE" | "PRJ",     // voir ADR-003
  nomReel: string,                          // donnée sensible
  aliasActif: string,                       // ex: "PDT" — voir ADR-002
  format: "court" | "etendu" | "opaque",
  siteId: string,                           // référence fogbank.sites[].id
  creeLe: string,                           // ISO date
  expireLe: string | null,                  // null = infini
  historique: [
    { alias: string, attribueLe: string, expireLe: string | null }
  ]
}
```

Le pseudonyme réellement inséré dans le prompt est composé à la volée à
partir de l'entité : `` `[${type}:${aliasActif}]` `` (ex: `[PER:PDT]`).

## Flux principaux

**Envoi (M-03 → M-06)**
1. `content.js` écoute la frappe du caractère déclencheur dans le champ de
   saisie de l'adaptateur actif.
2. `mention-menu.js` ouvre le menu, interroge `fogbank.annuaire` (via
   message vers le background ou lecture directe de `chrome.storage.local`
   — accessible depuis un content script), filtre par texte tapé.
3. Sélection ou création (M-04, avec choix du type M-11) → la mention est
   insérée en clair dans le champ, marquée (span avec style + `data-*`
   pointant vers l'id d'entité).
4. Au déclenchement de l'envoi (intercepté via l'adaptateur de site),
   `content.js` substitue chaque mention marquée par son tag
   `[TYP:CODE]` juste avant la soumission réelle.

**Réception (M-07)**
1. `content.js` observe (MutationObserver) la zone de réponse de
   l'adaptateur actif.
2. Détection des tags `[TYP:CODE]` par expression régulière, résolution
   via `fogbank.annuaire` (recherche par `type` + `aliasActif`, y compris
   dans l'historique pour les alias expirés — M-09).
3. Remplacement à l'affichage par le nom réel (le DOM affiché est modifié ;
   rien n'est réémis vers le site IA).

**Rotation (M-08)**
- `background.js` programme une `chrome.alarms` périodique (ex:
  quotidienne) qui parcourt `fogbank.annuaire`, compare `expireLe` à la
  date courante par entité, et régénère `aliasActif` si expiré — en
  ajoutant l'ancien alias à `historique` (jamais supprimé, M-09).

**Conversion manuelle de fichier (M-12)**
- Page d'options : zone de dépôt de fichier + choix de sens
  (pseudonymiser / restaurer) ; le texte est traité en mémoire avec la même
  logique de substitution/restauration que M-06/M-07, puis proposé au
  téléchargement.

**Export / import Excel (M-13)**
- Géré entièrement dans `options.js` via `vendor/xlsx.full.min.js` — voir
  [ADR-006](adr/0006-export-import-excel.md) pour le format des feuilles.

## Permissions manifest anticipées

```json
{
  "permissions": ["storage", "unlimitedStorage", "alarms"],
  "host_permissions": [
    "*://chat.openai.com/*",
    "*://claude.ai/*"
  ],
  "optional_host_permissions": ["*://*/*"]
}
```

(Liste des grands sites IA pré-activés à affiner avant implémentation —
domaines exacts à vérifier au moment du code, voir ADR-004.)

## Correspondance macro-UC → composants (synthèse)

| Macro-UC | Composant(s) principal(aux) |
|----------|------------------------------|
| M-01 | `options/`, `background.js` (permissions à la demande) |
| M-02 | `options/` |
| M-03, M-04, M-05, M-11 | `content/mention-menu.js` |
| M-06, M-07 | `content/content.js` + `site-adapters/` |
| M-08 | `background.js` (`chrome.alarms`) |
| M-09 | `fogbank.annuaire[].historique`, affiché via `options/` |
| M-10 | logique partagée (module de génération de pseudonyme, utilisé par `mention-menu.js` et `options/`) |
| M-12 | `options/` |
| M-13 | `options/` + `vendor/xlsx.full.min.js` |

## Statut

Brouillon à valider avant de passer au développement UC par UC.
