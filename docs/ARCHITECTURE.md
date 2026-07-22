# Architecture cible — fogbank

Ce document décrit l'architecture technique retenue pour implémenter les
macro-UC de [SPECS.md](SPECS.md). Les décisions structurantes avec
alternatives sont détaillées dans les ADR (`docs/adr/`) ; ce document en
donne la vue d'ensemble assemblée.

> **⚠ À refondre ([ADR-007](adr/0007-fail-closed.md))** : ce document décrit
> encore, pour l'essentiel, l'architecture fail-open telle qu'implémentée
> pour UC-001/UC-002 (substitution du vrai nom par le tag juste avant
> l'envoi, restauration par `MutationObserver` générique). ADR-007 redéfinit
> la cible en mode fail-closed — voir la section « Cible fail-closed
> (ADR-007) » ci-dessous et le détail technique dans
> [docs/recherche/reco.md](recherche/reco.md) (R-01 à R-63). Le reste du
> document (jusqu'à cette section) reste la description de l'état actuel du
> code, à faire évoluer en même temps que UC-001/UC-002.

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
//   isStreaming(container): boolean            // voir UC-002
//   onStreamingEnd(container, callback): void  // voir UC-002
// }
```

`generic.js` fournit une implémentation par défaut basée sur des
heuristiques (premier `textarea`/`contenteditable` visible, etc.) pour les
sites ajoutés manuellement sans adaptateur dédié. Pour `isStreaming` /
`onStreamingEnd`, le repli générique se fait par délai d'inactivité du
`MutationObserver` sur la zone de réponse (pas de signal DOM spécifique à
détecter, contrairement à un adaptateur dédié qui peut viser un élément
précis du site — bouton "regénérer", disparition d'un curseur...).

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

**Réception (M-07) — deux phases, voir UC-002 pour le détail complet**
1. `content.js` observe (MutationObserver) la zone de réponse de
   l'adaptateur actif.
2. **Phase 1 (pendant le streaming)** : dès qu'un tag `[TYP:CODE]` complet
   apparaît dans le texte streamé (regex `\[(PER|ORG|LIE|PRJ):[A-Z0-9-]+\]`),
   il est enveloppé dans un `<span>` stylisé (même soulignement que M-05),
   sans remplacer le texte — l'infobulle au survol montre le nom réel déjà
   résolu (voir résolution ci-dessous). Le tag brut reste visible : c'est
   la preuve que la pseudonymisation a fonctionné.
3. **Résolution** : via `fogbank.annuaire`, en cherchant, **parmi les
   entités de type `type`**, celle dont un `aliasParSite[]` (n'importe quel
   site, actif ou dans l'historique) a pour alias ce `CODE`. La recherche
   n'a pas besoin d'être scopée au site courant : le `CODE` est unique par
   type sur tout l'annuaire (voir plus haut) — c'est d'ailleurs cette même
   fonction de résolution, indépendante du site, qui est réutilisée telle
   quelle par M-12 (conversion manuelle d'un fichier hors contexte de
   site). Si aucune entité ne correspond (annuaire modifié entre-temps, tag
   halluciné), le tag reste affiché brut avec un style d'erreur distinct
   (voir UC-002, Cas d'erreur) — pas de remplacement en phase 2.
4. **Phase 2 (fin du streaming)**, détectée via `isStreaming`/
   `onStreamingEnd` de l'adaptateur (voir Adaptateurs de site) : le
   contenu textuel de chaque span est remplacé par le nom réel ; le tag
   d'origine est conservé en `data-*` pour une infobulle inversée (survol
   → réaffiche `[TYP:CODE]`, utile en debug). Aucune écriture n'est
   réémise vers le site IA : uniquement le DOM local est modifié.

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

(Cible ADR-007, R-03 : sites ajoutés manuellement restent en
`optional_host_permissions`, demandés via `chrome.permissions.request()`
depuis un geste utilisateur dans la page d'options, puis enregistrés via
`chrome.scripting.registerContentScripts({ …, world: 'MAIN' })` depuis le
service worker pour les hooks réseau de M-07 — voir section suivante.)

## Correspondance macro-UC → composants (synthèse, état actuel fail-open)

| Macro-UC | Composant(s) principal(aux) |
|----------|------------------------------|
| M-01 | `options/`, `background.js` (permissions à la demande) |
| M-02 | `options/` |
| M-03, M-04, M-05, M-11 | `content/mention-menu.js` |
| M-06, M-07 | `content/content.js` + `content/reception.js` + `site-adapters/` |
| M-08 | `content/content.js`, inline lors de la substitution à l'envoi (rotation paresseuse, pas de composant dédié) |
| M-09 | `fogbank.annuaire[].aliasParSite[].historique`, affiché via `options/` |
| M-10 | logique partagée (`content/pseudonyme.js`, utilisé par `mention-menu.js`, `reception.js` et `options/`) |
| M-12 | `options/` |
| M-13 | `options/` + `vendor/xlsx.full.min.js` |

Cette table reflète le code tel qu'implémenté pour UC-001/UC-002 (fail-open).
Voir la section suivante pour ce qui change avec ADR-007.

## Cible fail-closed (ADR-007)

Détail technique complet dans [docs/recherche/reco.md](recherche/reco.md)
(R-01 à R-63, §J pour l'ordre d'implémentation recommandé). Résumé de ce qui change dans
l'arborescence et les flux :

```
src/content/
├── editor-handle/              # NOUVEAU — façade de saisie (R-08 → R-18)
│   ├── textarea-handle.js      #   <textarea> et <input> ; mesure par miroir (R-19 → R-24)
│   └── contenteditable-handle.js  # Range natif, pas de miroir nécessaire
├── display/                    # NOUVEAU — calque de décoration (R-25 → R-46)
│   └── ...                     #   racine shadow DOM fermée, calque, infobulle, légende
├── site-adapters/
│   ├── chatgpt.js               # NOUVEAU — remplace le repli generic.js sur ce site
│   ├── claude.js                 # NOUVEAU
│   ├── copilot.js                # NOUVEAU — périmètre étendu par ADR-007
│   └── generic.js               # repli DOM seul ; UI doit annoncer l'absence de garantie de restauration (R-07)
├── mention-menu.js              # M-03/M-04 : insère le tag via EditorHandle.replaceRange, plus le vrai nom
├── pseudonyme.js                # inchangé (génération + résolution de code)
├── reception.js                 # M-07 : MutationObserver sur les trois sites (pas de hook réseau — écarté, voir ADR-007)
└── content.js                   # orchestration ; perd la substitution à l'envoi, M-06 devient quasiment vestigial (pas de garde-fou, voir ADR-007)
```

**Contrat d'adaptateur cible** (garde `getResponseContainer`/
`isStreaming(container)`/`onStreamingEnd(container, callback)` — déjà
implémentés dans `generic.js` pour UC-002 — mais étendu à `getComposer` et
`inputKind`, voir R-04/R-05/R-07 ; **pas de champ réseau** `transport`/
`matchRecv` : décision de simplification, M-07 reste du DOM pur sur les
trois sites, voir ADR-007) :

```js
export const chatgpt = {
  id: 'chatgpt',
  matches: (url) => /^https:\/\/chatgpt\.com\//.test(url),

  // --- saisie
  inputKind: 'contenteditable',              // 'textarea' | 'contenteditable' — déclaré, jamais deviné (R-05)
  getComposer:   () => document.querySelector('form:has(#prompt-textarea)'),
  getInputField: () => document.querySelector('#prompt-textarea'),
  getSendTrigger:() => document.querySelector('#composer-submit-button'),

  // --- réponse (M-07, DOM uniquement — voir ADR-007)
  getResponseContainer: () => document.querySelector('#thread'),
  // Signal précis propre au site plutôt que l'heuristique d'inactivité
  // générique : le même bouton bascule stop/send pendant la génération.
  isStreaming: (container) => !!document.querySelector('[data-testid="stop-button"]'),
  onStreamingEnd: (container, callback) => {
    // ex: MutationObserver sur le bouton d'envoi, callback() quand
    // `[data-testid="stop-button"]` disparaît — plus précis et plus
    // rapide que l'inactivité, mais reste du DOM, pas du réseau.
  },
};
```

`generic.js` reste sur l'heuristique d'inactivité `MutationObserver` déjà
implémentée (seul repli sans signal dédié). Les adaptateurs de site
(`chatgpt.js`, `claude.js`, `copilot.js`) peuvent fournir un
`isStreaming`/`onStreamingEnd` plus précis et plus rapide (bouton stop,
attribut `data-is-streaming`...), mais restent sur le même mécanisme DOM,
pas sur un hook réseau. L'UI doit annoncer explicitement, pour un site
ajouté manuellement sans adaptateur dédié, que fogbank n'y garantit pas la
restauration avec la même réactivité (R-07).

**Façade `EditorHandle`** (R-08 à R-18) : plus aucun code fogbank ne touche
l'élément de saisie brut. Deux implémentations (`TextareaHandle`,
`ContentEditableHandle`), une primitive d'écriture unique
(`document.execCommand('insertText')`, avec repli setter-de-prototype sur
`<textarea>` pour rester visible du tracker React — R-10/R-11), gestion de
l'IME (R-13), re-résolution du champ au changement de route SPA (R-16).

**Couche d'affichage** (R-25 à R-46) : une racine shadow DOM **fermée**,
accrochée à `document.documentElement`, hôte anodin (pas d'`id`/`class`
identifiable, R-27), sans ressource externe (R-28), stylée par
`adoptedStyleSheets` (R-29). Elle porte le miroir de mesure (`<textarea>`
seulement), le calque de soulignement (peinture seule — `background`,
`box-shadow`, jamais de propriété qui décale les glyphes, R-32/R-33),
l'infobulle (verre dépoli, thème du site détecté par luminance de fond,
R-34/R-35) et la légende sous le champ (base non dépendante de la mesure
géométrique, à livrer avant le calque si un choix doit être fait — R-43).

**Flux Envoi (cible)** — remplace M-06 « pseudonymisation à l'envoi », voir
UC-001 (réécrit dans [SPECS.md](SPECS.md)) :
1. M-04 insère le tag `[TYP:CODE]` via `EditorHandle.replaceRange`, jamais
   le vrai nom.
2. À l'envoi (`Enter` ou clic), **rien n'est réécrit ni bloqué** : le
   contenu soumis est exactement celui du champ, tag compris, puisque
   c'est déjà ce qui y a été inséré à l'étape 1. `content.js` n'a plus
   aucun rôle à jouer à ce moment (pas de garde-fou, pas de détection de
   vrai nom en clair — décision qui s'écarte de R-50 à R-53, voir
   [ADR-007](adr/0007-fail-closed.md) Conséquences et UC-001 Contraintes :
   fogbank protège ce qui passe par le menu `&`, pas ce qui est tapé à côté).
3. Un tag corrompu par une édition manuelle à l'intérieur (R-48, la regex ne
   le matche plus) est signalé par le calque de décoration (soulignement
   pointillé rouge, légende « tag invalide ») mais n'empêche pas non plus
   l'envoi — décoration seule, aucune annulation d'événement dans ce flux.

**Flux Réception (cible)** — M-07, **mécanisme unique pour les trois
sites**, décision de simplification prise après ADR-007 : le hook réseau
entrant recommandé par `docs/recherche/reco.md` (R-54 à R-56 : `fetch`/SSE
en monde `MAIN`, `TransformStream`, échappement JSON) a été jugé trop
complexe pour le gain et **n'est pas retenu**. fogbank reste sur du DOM pur,
sensiblement ce qu'implémente déjà `content/reception.js` pour UC-002 :
1. `MutationObserver` sur `getResponseContainer()` de l'adaptateur actif.
   Pendant le streaming, fogbank peut ne rien faire — aucune obligation de
   marquer les tags au fur et à mesure (contrairement à la phase 1 déjà
   implémentée, qui reste un bonus best-effort, pas un requis).
2. Une fois la réponse stable — fin de streaming détectée via
   `isStreaming`/`onStreamingEnd` (signal dédié si l'adaptateur en fournit
   un, sinon repli par inactivité), ou immédiatement si la réponse arrive
   d'un coup — passage unique : chaque tag complet est résolu via
   l'annuaire et remplacé par le nom réel, marquage conservé pour la
   traçabilité (infobulle inversée vers le tag d'origine au survol).
3. Une restauration ratée n'est pas une fuite (au pire un pseudonyme reste
   affiché tel quel) — acceptable en réception, contrairement à l'envoi
   (R-58, désormais valable pour les trois sites, pas seulement Copilot).
4. Idempotence (ne jamais restaurer deux fois, ni le texte en cours de
   frappe de l'utilisateur, R-60). Point de vigilance non résolu ici :
   l'implémentation actuelle enveloppe chaque tag dans un `<span>` inséré
   dans le DOM, ce qui ajoute un nœud dans un sous-arbre potentiellement
   rendu par React — R-59 recommande de ne remplacer que le contenu d'un
   nœud texte existant, jamais d'ajouter/retirer d'enfants, pour éviter un
   `NotFoundError` au prochain re-rendu du composant. À surveiller lors des
   tests contre les fixtures dédiées, pas nécessairement à corriger avant.
   Corollaire du DOM pur (pas de hook réseau) : une conversation rechargée
   (page rafraîchie, historique déjà rendu) ne génère aucune mutation à
   observer — `onStreamingEnd` ne se déclenchera pas tout seul. Un passage
   initial explicite au chargement (déjà fait par `reception.js` pour le
   marquage) doit aussi couvrir la restauration finale dans ce cas, pas
   seulement le marquage — point ouvert, voir UC-002.

**Fixtures** : `tests/fixtures/mock-ai-site/` garde ses deux scénarios
(`<textarea>` / `contenteditable`, R-63) pour exercer les deux
`EditorHandle` indépendamment des trois sites réels.

## Statut

Brouillon à valider avant de passer au développement UC par UC. La section
« Cible fail-closed (ADR-007) » ci-dessus est la direction retenue ; le
reste du document décrit encore le code fail-open actuellement implémenté
(UC-001/UC-002), à faire converger vers cette cible — voir
`docs/recherche/reco.md` §J pour l'ordre proposé.
