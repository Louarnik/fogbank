# Architecture cible — fogbank

Ce document décrit l'architecture technique retenue pour implémenter les
macro-UC de [SPECS.md](SPECS.md). Les décisions structurantes avec
alternatives sont détaillées dans les ADR (`docs/adr/`) ; ce document en
donne la vue d'ensemble assemblée.

> **Fail-closed implémenté ([ADR-007](adr/0007-fail-closed.md))** : ce
> document décrit désormais l'architecture fail-closed telle qu'implémentée
> pour UC-001/UC-002 (tag inséré directement dans le champ, jamais substitué ;
> restauration par `MutationObserver` générique, sans hook réseau). Reste à
> faire : les adaptateurs dédiés par site (`chatgpt.js`, `claude.js`,
> `copilot.js`) — voir « Travail restant » en fin de document. Détail
> technique complet dans [docs/recherche/reco.md](recherche/reco.md)
> (R-01 à R-63), y compris les recommandations non retenues (garde-fou à
> l'envoi, hook réseau en réception — voir ADR-007 Conséquences).

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
- **Fail-closed ([ADR-007](adr/0007-fail-closed.md))** : le tag `[TYP:CODE]`
  est la source de vérité dans l'éditeur, jamais le vrai nom. Aucune
  réécriture du champ n'a lieu à l'envoi ; le vrai nom n'est que décoré à
  l'affichage, dans une couche cloisonnée (shadow root fermé) qui ne dépose
  rien dans le DOM du site.

## Composants de l'extension (Manifest V3)

```
src/
├── manifest.json
├── background/
│   └── background.js       # service worker
├── content/
│   ├── content.js           # point d'entrée injecté sur les sites autorisés (orchestration multi-champs)
│   ├── editor-handle/        # façade de saisie (R-08 → R-18) — abstrait <textarea> et contenteditable
│   │   ├── textarea-handle.js       #   mesure par miroir (R-19 → R-24)
│   │   └── contenteditable-handle.js  # Range natif, pas de miroir nécessaire
│   ├── display.js            # calque de décoration (R-25 → R-46) : racine shadow DOM fermée, légende, infobulle, soulignement
│   ├── mention-menu.js       # menu déclenché par "&" (M-03/M-04) : insère le tag via EditorHandle
│   ├── pseudonyme.js         # génération/résolution de code + regex de tag partagée (M-10)
│   ├── reception.js          # restauration à la réception (M-07)
│   └── site-adapters/        # un adaptateur par site IA (sélecteurs DOM spécifiques)
│       ├── chatgpt.js        # PRÉVU, pas encore implémenté — voir « Travail restant »
│       ├── claude.js         # PRÉVU, pas encore implémenté
│       ├── copilot.js        # PRÉVU, pas encore implémenté
│       └── generic.js        # repli pour un site ajouté manuellement (seul adaptateur existant)
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
| `content/editor-handle/` | Façade de saisie unique pour `<textarea>` et `contenteditable` (`getText`, `replaceRange`, `getRangeRects`...) | M-04 |
| `content/mention-menu.js` | Détecte `&`, affiche le menu, insère le tag `[TYP:CODE]` via l'`EditorHandle` | M-03, M-04, M-11 |
| `content/display.js` | Calque de décoration cloisonné (shadow DOM) : légende sous le champ, infobulle, soulignement | M-05 |
| `content/reception.js` + `site-adapters/*` | Restauration à la réception : marquage best-effort pendant le streaming, substitution finale garantie | M-07 |
| `content/pseudonyme.js` | Génération de code (M-10), résolution inverse, regex de tag partagée | M-10 |
| `content/site-adapters/*` | Abstraction des sélecteurs DOM propres à chaque site (champs de saisie, bouton d'envoi, zone de réponse) | M-01, M-07 |
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
//   getInputFields(): HTMLElement[]                    // un site n'a en général qu'un seul composer ;
//                                                       // le pluriel accueille le cas générique multi-champs (fixtures)
//   getSendTrigger(champ): HTMLElement | null           // bouton ou raccourci d'envoi propre à ce champ
//   getResponseContainer(champ): HTMLElement | null     // zone de réponse associée à ce champ
//   isStreaming(container): boolean                     // voir UC-002
//   onStreamingEnd(container, callback): void            // voir UC-002 ; rappelé à chaque réponse, pas une seule fois
// }
```

`generic.js` (seul adaptateur existant à ce jour, voir « Travail restant »)
fournit une implémentation par défaut basée sur des heuristiques : tout
`<textarea>`/`contenteditable` de la page qui n'est pas caché dans un
`<details>` replié, un bouton d'envoi trouvé en cherchant le premier bouton
qui suit le champ dans le document (en remontant les ancêtres du champ si
nécessaire pour atteindre une zone de réponse plausible), une zone de
réponse déduite du bouton d'envoi. Pour `isStreaming`/`onStreamingEnd`, le
repli générique se fait par délai d'inactivité du `MutationObserver` sur la
zone de réponse (pas de signal DOM spécifique à détecter, contrairement à
un adaptateur dédié qui peut viser un élément précis du site — bouton
"regénérer", disparition d'un curseur...).

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

**Envoi (M-03 → M-04, fail-closed — voir UC-001)**
1. `content.js` récupère tous les champs de saisie de l'adaptateur actif
   (`getInputFields()`) et attache, à chacun indépendamment, un
   `EditorHandle` (`TextareaHandle` ou `ContentEditableHandle` selon le
   type de champ), `mention-menu.js` et `display.js`.
2. `mention-menu.js` écoute la frappe du caractère déclencheur dans le
   champ (via l'événement `input` natif, pas un espionnage de
   `EditorHandle`), interroge `fogbank.annuaire` (lecture directe de
   `chrome.storage.local`, accessible depuis un content script), filtre
   par texte tapé.
3. Sélection (M-04) → le tag `[TYP:CODE]` est inséré **directement dans le
   champ** via `EditorHandle.replaceRange` (jamais le vrai nom), `CODE`
   étant l'alias de l'entité **pour le site courant** (`aliasParSite`
   correspondant à ce `siteId` — créé à la volée si l'entité n'a encore
   aucun alias sur ce site). C'est à ce même moment qu'a lieu la
   **rotation paresseuse** (voir plus bas) : avant d'utiliser l'alias, on
   vérifie s'il est expiré et on le régénère si besoin.
4. `display.js` détecte le tag fraîchement inséré au prochain événement
   `input` (déclenché naturellement par `execCommand('insertText')`) et
   met à jour la légende sous le champ + le soulignement — sans jamais
   toucher au contenu du champ lui-même.
5. À l'envoi (`Enter` ou clic sur le bouton détecté), **rien n'est
   réécrit** : le contenu soumis est exactement celui du champ, tag
   compris, puisque c'est déjà ce qui y a été inséré à l'étape 3. M-06
   (« pseudonymisation à l'envoi ») est donc vestigial : aucun composant
   n'intervient à ce moment.

**Réception (M-07, fail-closed, mécanisme simplifié — voir UC-002)**
1. `content.js` appelle `reception.js` avec la zone de réponse associée à
   chaque champ (`getResponseContainer(champ)`), qui y attache un
   `MutationObserver`.
2. **Marquage best-effort (pas requis)**, pendant que la réponse arrive :
   dès qu'un tag `[TYP:CODE]` complet apparaît dans le texte (regex
   partagée, voir `pseudonyme.js`), il est enveloppé dans un `<span>`
   stylisé (même soulignement que M-05), sans remplacer le texte —
   l'infobulle au survol montre le nom réel déjà résolu. fogbank peut
   choisir de ne rien faire tant que la réponse n'est pas stable, sans que
   ce soit considéré comme un défaut.
3. **Résolution** : via `fogbank.annuaire`, en cherchant, **parmi les
   entités de type `type`**, celle dont un `aliasParSite[]` (n'importe quel
   site, actif ou dans l'historique) a pour alias ce `CODE`. La recherche
   n'a pas besoin d'être scopée au site courant : le `CODE` est unique par
   type sur tout l'annuaire (voir plus haut) — c'est d'ailleurs cette même
   fonction de résolution, indépendante du site, qui est réutilisée telle
   quelle par M-12 (conversion manuelle d'un fichier hors contexte de
   site). Si aucune entité ne correspond (annuaire modifié entre-temps, tag
   halluciné), le tag reste affiché brut avec un style d'erreur distinct
   (voir UC-002, Cas d'erreur) — pas de substitution finale.
4. **Substitution finale (requise)**, déclenchée soit dès l'attache (cas
   d'une conversation déjà rendue au chargement — voir UC-002 Points
   ouverts), soit via `isStreaming`/`onStreamingEnd` de l'adaptateur (voir
   Adaptateurs de site) une fois la réponse stable : le contenu textuel de
   chaque span est remplacé par le nom réel ; le tag d'origine est
   conservé en `data-*` pour une infobulle inversée (survol → réaffiche
   `[TYP:CODE]`, utile en debug). Aucune écriture n'est réémise vers le
   site IA : uniquement le DOM local est modifié.

**Rotation (M-08) — paresseuse, pas de tâche périodique**
- Pas de `chrome.alarms` ni de balayage périodique de tout l'annuaire :
  inutile de faire ce travail si l'alias n'est jamais réutilisé entre-temps.
  La vérification d'expiration se fait à la place **au moment où l'alias
  est effectivement utilisé**, c'est-à-dire lors de l'insertion du tag
  (étape 3 du flux Envoi ci-dessus, plus de geste de substitution à
  l'envoi auquel l'accrocher en fail-closed) : `content.js` compare
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
  logique de génération/résolution de code que M-10, et la même restauration
  que M-07, puis proposé au téléchargement. Le fichier proposé au téléchargement porte un infixe
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
    "*://chatgpt.com/*",
    "*://claude.ai/*",
    "*://copilot.microsoft.com/*"
  ],
  "optional_host_permissions": ["*://*/*"]
}
```

(Pas de permission `alarms` : la rotation des pseudonymes est paresseuse,
déclenchée à l'usage plutôt que par une tâche périodique — voir M-08.)

(Domaines mis à jour suite au relevé factuel — voir
[docs/recherche/](recherche/) : `chat.openai.com` redirige vers
`chatgpt.com` mais n'a jamais été le domaine effectif ; `copilot.microsoft.com`
ajouté suite à [ADR-007](adr/0007-fail-closed.md) (Copilot grand public
maintenu au périmètre). Domaines exacts à revérifier au moment du code via
les sondes de `docs/recherche/constat-*.md`.)

(Sites ajoutés manuellement restent en `optional_host_permissions`,
demandés via `chrome.permissions.request()` depuis un geste utilisateur
dans la page d'options — R-03. Pas besoin de `world: 'MAIN'` : sans hook
réseau, tout le code fogbank tourne dans le monde `ISOLATED` par défaut
d'un content script.)

## Correspondance macro-UC → composants (synthèse)

| Macro-UC | Composant(s) principal(aux) |
|----------|------------------------------|
| M-01 | `options/`, `background.js` (permissions à la demande) |
| M-02 | `options/` |
| M-03, M-04, M-11 | `content/mention-menu.js` + `content/editor-handle/` |
| M-05 | `content/display.js` |
| M-06 | vestigial — aucun composant, voir Flux Envoi |
| M-07 | `content/reception.js` + `site-adapters/*` |
| M-08 | `content/content.js`, inline lors de l'insertion du tag (rotation paresseuse, pas de composant dédié) |
| M-09 | `fogbank.annuaire[].aliasParSite[].historique`, affiché via `options/` |
| M-10 | logique partagée (`content/pseudonyme.js`, utilisé par `mention-menu.js`, `reception.js` et `options/`) |
| M-12 | `options/` |
| M-13 | `options/` + `vendor/xlsx.full.min.js` |

## Travail restant : adaptateurs de site dédiés

`generic.js` est aujourd'hui le **seul** adaptateur : ChatGPT, Claude.ai et
Copilot tournent tous dessus, avec les limites que ça implique (repli par
heuristiques DOM plutôt que sélecteurs exacts, pas de qualification par
conteneur — voir le décoy de `mock-claude-site`). Écrire `chatgpt.js`,
`claude.js` et `copilot.js` reste à faire. Ce que chacun apporterait par
rapport au repli générique, contrat déjà en place (`getInputFields`,
`getSendTrigger`, `getResponseContainer`, `isStreaming`, `onStreamingEnd`) :

- **Sélecteurs exacts** au lieu d'heuristiques : `getInputFields` retourne
  un seul champ ciblé par `id`/`data-testid` plutôt que tout
  `[contenteditable]`/`textarea` de la page (voir
  `docs/recherche/constat-*.md` pour les sélecteurs relevés par site).
- **Qualification du champ par son conteneur** (`form:has(#prompt-textarea)`
  sur ChatGPT, par ex.) — nécessaire sur Claude.ai où plusieurs éditeurs
  ProseMirror coexistent (composer, renommage, édition d'un message).
- **Signal `isStreaming`/`onStreamingEnd` dédié** plutôt que l'heuristique
  d'inactivité générique : ex. présence de `[data-testid="stop-button"]`
  sur ChatGPT, attribut `data-is-streaming` sur Claude.ai — plus précis et
  plus rapide, mais toujours du DOM, pas de hook réseau (voir ADR-007).
- **`copilot.js`** reste sur `<textarea>` natif, sans signal de fin de
  streaming propre au site (voir `constat-copilot.md` §4.3) — l'apport
  serait surtout des sélecteurs exacts, pas un meilleur signal.

Aucun de ces trois adaptateurs n'ajoute `transport`/`matchRecv` ni de champ
réseau : ADR-007 a écarté le hook réseau entier pour M-07 (voir
Conséquences), et il n'a jamais été retenu pour M-06 (fail-closed dès
l'insertion). `tests/fixtures/mock-claude-site/` et `mock-copilot-site/`
existent déjà pour développer ces deux adaptateurs sans dépendre des vrais
sites — voir `docs/recherche/reco.md` §J pour l'ordre d'implémentation
suggéré à l'origine (désormais partiellement caduc : EditorHandle, couche
d'affichage et mécanisme de réception sont déjà faits).

## Statut

Composants communs (EditorHandle, calque de décoration, mention-menu,
réception, orchestration multi-champs) implémentés pour UC-001/UC-002, pas
encore vérifiés dans un vrai Chrome chargé (unpacked) contre les fixtures.
Reste à faire : adaptateurs dédiés par site (section précédente), puis
`options/`, `popup/`, M-01/M-02/M-08/M-09/M-12/M-13.
