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
| `background/background.js` | Cycle de vie de l'extension, gestion des permissions de site à la demande | M-01 |
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
  formatParDefaut: "court" | "etendu" | "opaque"  // pré-rempli à la création d'un nouveau site (M-01) ; voir ADR-002
}

// fogbank.sites[]
{
  id: string,
  domaine: string,                         // ex: "chat.openai.com"
  preActive: boolean,                      // true pour les grands sites IA (ADR-004)
  actif: boolean,
  dureeViePseudonyme: "1s" | "1t" | "1a" | "infini",  // M-08
  formatPseudonyme: "court" | "etendu" | "opaque"     // voir ADR-002 — s'applique à toutes les entités sur ce site
}

// fogbank.annuaire[] — UNE entrée par entité, quel que soit le nombre de
// sites sur lesquels elle est mentionnée
{
  id: string,
  type: "PER" | "ORG" | "LIE" | "PRJ",     // voir ADR-003
  nomReel: string,                          // donnée sensible
  email: string | null,                     // facultatif, pertinent seulement si type === "PER"
  creeLe: string,                           // ISO date — ajout de l'entité à l'annuaire
  aliasParSite: [
    {
      siteId: string,                       // référence fogbank.sites[].id
      aliasActif: string,                   // ex: "PDT" — voir ADR-002
      expireLe: string | null,              // null = infini (durée définie par le site, M-08)
      historique: [
        { alias: string, attribueLe: string, expireLe: string | null }
      ]
    }
  ]
}
```

Une même entité a un alias **indépendant par site** : elle peut ne pas
encore être utilisée sur tel site, avoir un alias actif sur tel autre, et
un historique de rotation propre à chacun.

En revanche, l'**unicité du `CODE`** (pour un `type` donné) est **globale**,
tous sites confondus — ce n'est *pas* scopée par site. Raison : M-12
(conversion manuelle d'un fichier) doit pouvoir résoudre un tag
`[TYP:CODE]` sans connaître le site d'origine du fichier ; si deux entités
différentes pouvaient porter le même code sur deux sites différents, la
résolution serait ambiguë dès que le fichier sort du contexte d'un site
précis. La génération d'un nouvel alias (M-10) doit donc vérifier
l'absence de collision dans **tout** `fogbank.annuaire` (tous les
`aliasParSite[].historique` de toutes les entités du même `type`, quel que
soit le site), pas seulement dans le site courant.

Le **format de génération** (court/étendu/opaque) est une caractéristique
du site (`fogbank.sites[].formatPseudonyme`), pas de l'entité : toutes les
entités mentionnées sur un même site partagent le même style de
pseudonyme, au même titre que sa durée de vie (M-08). Une même entité peut
donc avoir des styles différents selon le site (ex: alias court sur
ChatGPT, alias étendu sur Claude).

Le pseudonyme réellement inséré dans le prompt est composé à la volée à
partir de l'entité et du site courant :
`` `[${type}:${aliasParSite[siteId].aliasActif}]` `` (ex: `[PER:PDT]`).

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
   `[TYP:CODE]` juste avant la soumission réelle, `CODE` étant l'alias de
   l'entité **pour le site courant** (`aliasParSite` correspondant à ce
   `siteId` — créé à la volée si l'entité n'a encore aucun alias sur ce
   site, point à préciser dans l'UC détaillé de M-04/M-10). C'est à ce
   même moment qu'a lieu la **rotation paresseuse** (voir plus bas) :
   avant d'utiliser l'alias, on vérifie s'il est expiré et on le régénère
   si besoin.

**Réception (M-07)**
1. `content.js` observe (MutationObserver) la zone de réponse de
   l'adaptateur actif.
2. Détection des tags `[TYP:CODE]` par expression régulière, résolution
   via `fogbank.annuaire` en cherchant, **parmi les entités de type
   `type`**, celle dont un `aliasParSite[]` (n'importe quel site, actif ou
   dans l'historique) a pour alias ce `CODE`. La recherche n'a pas besoin
   d'être scopée au site courant : le `CODE` est unique par type sur tout
   l'annuaire (voir plus haut) — c'est d'ailleurs cette même fonction de
   résolution, indépendante du site, qui est réutilisée telle quelle par
   M-12 (conversion manuelle d'un fichier hors contexte de site).
3. Remplacement à l'affichage par le nom réel (le DOM affiché est modifié ;
   rien n'est réémis vers le site IA).

**Rotation (M-08) — paresseuse, pas de tâche périodique**
- Pas de `chrome.alarms` ni de balayage périodique de tout l'annuaire :
  inutile de faire ce travail si l'alias n'est jamais réutilisé entre-temps.
  La vérification d'expiration se fait à la place **au moment où l'alias
  est effectivement utilisé**, c'est-à-dire lors de la substitution à
  l'envoi (étape 4 du flux Envoi ci-dessus) : `content.js` compare
  `expireLe` de l'`aliasParSite` concerné à la date courante ; si expiré,
  un nouvel alias est généré à la volée (en respectant l'unicité globale
  par type, voir plus haut) avant d'être inséré dans le tag `[TYP:CODE]` —
  l'ancien alias est ajouté à `historique` (jamais supprimé, M-09). Les
  autres sites de la même entité ne sont pas affectés.
- Conséquence acceptée : un alias expiré depuis longtemps mais jamais
  réutilisé ne tourne jamais "en arrière-plan" — il n'est régénéré qu'au
  prochain usage réel, ce qui est cohérent avec l'objectif (éviter de faire
  tourner un job pour rien quand rien n'est utilisé).

**Conversion manuelle de fichier (M-12)**
- Page d'options : zone de dépôt de fichier + choix de sens
  (pseudonymiser / restaurer) ; le texte est traité en mémoire avec la même
  logique de substitution/restauration que M-06/M-07, puis proposé au
  téléchargement. Le fichier proposé au téléchargement porte un infixe
  avant l'extension d'origine pour indiquer le sens appliqué : `rapport.txt`
  → `rapport.fog.txt` (pseudonymisé) ou `rapport.unfog.txt` (restauré).

**Export / import Excel (M-13)**
- Géré entièrement dans `options.js` via `vendor/xlsx.full.min.js` — voir
  [ADR-006](adr/0006-export-import-excel.md) pour le format des feuilles.

## Permissions manifest anticipées

```json
{
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": [
    "*://chat.openai.com/*",
    "*://claude.ai/*"
  ],
  "optional_host_permissions": ["*://*/*"]
}
```

(Pas de permission `alarms` : la rotation des pseudonymes est paresseuse,
déclenchée à l'usage plutôt que par une tâche périodique — voir M-08.)

(Liste des grands sites IA pré-activés à affiner avant implémentation —
domaines exacts à vérifier au moment du code, voir ADR-004.)

## Correspondance macro-UC → composants (synthèse)

| Macro-UC | Composant(s) principal(aux) |
|----------|------------------------------|
| M-01 | `options/`, `background.js` (permissions à la demande) |
| M-02 | `options/` |
| M-03, M-04, M-05, M-11 | `content/mention-menu.js` |
| M-06, M-07 | `content/content.js` + `site-adapters/` |
| M-08 | `content/content.js`, inline lors de la substitution à l'envoi (rotation paresseuse, pas de composant dédié) |
| M-09 | `fogbank.annuaire[].aliasParSite[].historique`, affiché via `options/` |
| M-10 | logique partagée (module de génération de pseudonyme, utilisé par `mention-menu.js` et `options/`) |
| M-12 | `options/` |
| M-13 | `options/` + `vendor/xlsx.full.min.js` |

## Statut

Brouillon à valider avant de passer au développement UC par UC.
