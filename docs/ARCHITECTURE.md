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
├── shared/
│   └── site-matching.js     # correspondance site/URL — partagée par content.js et popup.js
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
│   └── site-adapters/
│       └── generic.js        # seul adaptateur : ne fait plus que détecter les champs de saisie (voir « Travail restant »)
├── options/                  # deux onglets : Annuaire (CRUD entités) et Sites (CRUD fogbank.sites)
│   ├── options.html
│   ├── options.js
│   └── options.css
├── popup/                    # statut du site courant, activer/désactiver, pause temporaire, liens vers options/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── vendor/                   # dépendances tierces vendored
│   └── xlsx.full.min.js      # SheetJS CE, Apache-2.0 (voir ADR-006)
└── icons/
```

| Composant | Rôle | Macro-UC couverts |
|-----------|------|--------------------|
| `content/editor-handle/` | Façade de saisie unique pour `<textarea>` et `contenteditable` (`getText`, `replaceRange`, `getRangeRects`...) | M-04 |
| `content/mention-menu.js` | Détecte `&`, affiche le menu, insère le tag `[TYP:CODE]` via l'`EditorHandle` | M-03, M-04, M-11 |
| `content/display.js` | Calque de décoration cloisonné (shadow DOM) : légende sous le champ, infobulle, soulignement | M-05 |
| `content/reception.js` | Restauration à la réception : scanne tout le texte de la page, substitue chaque tag `[TYP:CODE]` trouvé (hors champ de saisie) | M-07 |
| `content/pseudonyme.js` | Génération de code (M-10), résolution inverse, regex de tag partagée | M-10 |
| `content/site-adapters/generic.js` | Détection des champs de saisie (`getInputFields`) — plus de zone de réponse ni de bouton d'envoi à identifier | M-01 |
| `background/background.js` | Cycle de vie de l'extension, gestion des permissions de site à la demande | M-01 |
| `options/` | Deux onglets : CRUD de l'annuaire (entités), CRUD des sites (`fogbank.sites`) — format de pseudonyme, durée de vie, actif/inactif | M-01, M-02, M-09, M-10, M-12 |
| `popup/` | Statut du site de l'onglet actif (reconnu/non, actif/inactif) avec bascule directe, pause temporaire (`fogbank.pause`, sans recharger), liens vers les deux onglets de `options/` | M-01 |
| `vendor/xlsx.full.min.js` | Lecture/écriture de fichiers `.xlsx` en local (prévu, pas encore branché à `options/`) | M-13 |

La page d'options (`options_page` dans `manifest.json`) s'ouvre dans son
propre onglet plutôt qu'en popover : les tableaux d'annuaire et de sites
gagnent à disposer de tout l'espace d'un onglet. La popup ouvre son onglet
« Sites » via `chrome.tabs.create` (URL `options/options.html#sites`,
lue par `options.js` au chargement) plutôt que par `openOptionsPage()`
(qui ne permet pas de cibler un onglet interne précis) ; l'onglet
« Annuaire » utilise `openOptionsPage()`, qui réutilise une page d'options
déjà ouverte au lieu d'en dupliquer une.

### Adaptateurs de site — et pourquoi il n'y en a plus qu'un

Deux générations ont été essayées et abandonnées avant l'approche actuelle
(voir bugs.md pour l'historique complet des retours de test) :

1. Un adaptateur générique déduisant la zone de réponse par proximité du
   bouton d'envoi (premier bouton après le champ, puis remontée
   d'ancêtres). Fonctionnait sur les fixtures, se trompait de zone de
   réponse dès qu'un vrai composer avait plusieurs boutons avant celui
   d'envoi (pièce jointe, sélecteur de modèle...).
2. Des adaptateurs dédiés (`chatgpt.js`, `claude.js`) ciblant des sélecteurs
   exacts relevés dans `docs/recherche/constat-*.md` (`#prompt-textarea`,
   `#thread`, `div.ProseMirror`, `.group/conversation-turn`...). Toujours en
   échec après test sur les vrais sites — sélecteurs périmés, Trusted
   Types, ou structure plus mouvante que prévu, sans certitude sur la cause
   exacte.

Les deux généraient la même classe de problème : **deviner où chercher**.
L'approche retenue à la place ne cherche plus de zone de réponse ni de
bouton d'envoi du tout — voir « Flux » ci-dessous et `content.js`.
`site-adapters/generic.js` ne garde donc qu'une interface réduite :

```js
// {
//   matches(url): boolean
//   getInputFields(): HTMLElement[]   // tout contenteditable/textarea de la page
// }
```

`getInputFields()` retourne tout `<textarea>`/`contenteditable` de la page
qui n'est pas caché dans un `<details>` replié — « partout où on peut
saisir du texte », sans chercher à distinguer LE composer d'un site.

## Modèle de données (`chrome.storage.local`)

Voir [ADR-005](adr/0005-stockage-local.md) pour la justification du choix
de stockage.

```js
// fogbank.config
{
  caractereDeclencheur: "&",              // voir ADR-001
  formatParDefaut: "court" | "etendu" | "opaque"  // pré-rempli à la création d'un nouveau site (M-01) ; voir ADR-002
}

// fogbank.pause : boolean, absent = false. Bascule globale (pas par site)
// posée par la popup — voir Flux. Lue une fois au chargement de
// content.js puis suivie en direct via chrome.storage.onChanged (pas de
// rechargement de page nécessaire, contrairement à fogbank.sites[].actif).

// fogbank.sites[]
{
  id: string,
  domaine: string,                         // ex: "chatgpt.com"
  preActive: boolean,                      // true pour les grands sites IA (ADR-004)
  actif: boolean,
  dureeViePseudonyme: "1s" | "1t" | "1a" | "infini",  // M-08
  formatPseudonyme: "court" | "etendu" | "opaque"     // voir ADR-002 — s'applique à toutes les entités sur ce site
}

// fogbank.annuaire[] — UNE entrée par entité, quel que soit le nombre de
// sites sur lesquels elle est mentionnée
{
  id: string,
  type: "PER" | "ORG" | "LOC" | "PRJ" | "MISC",     // voir ADR-003
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

**Réception (M-07, fail-closed, approche page entière — voir UC-002)**
1. `content.js` pose un unique `MutationObserver` sur `document.body`
   (`childList`, `subtree`, `characterData`) et **débounce** : chaque
   mutation reporte un minuteur de 500 ms (`DELAI_STABILITE_MS`). Rien ne
   se passe tant que la page bouge encore ; un premier passage est aussi
   planifié inconditionnellement au chargement, pour couvrir une page déjà
   entièrement rendue (conversation relue) que le observer ne verrait
   jamais bouger.
2. Une fois la page stable, `reception.js#traiterPage(document.body,
   resoudre)` parcourt **tous les nœuds texte de la page** (`TreeWalker`) et
   traite chaque tag `[TYP:CODE]` complet trouvé (regex partagée, voir
   `pseudonyme.js`) — où qu'il soit, sans chercher à identifier une zone de
   réponse. Exclusions : tout nœud dans un champ de saisie actif
   (`[contenteditable="true"], textarea` — jamais touché, R-31) et tout
   nœud dans l'UI flottante de fogbank lui-même (menu de mention, infobulle
   de réception), pour ne pas se retraiter en boucle.
3. **Résolution** : via `fogbank.annuaire`, en cherchant, **parmi les
   entités de type `type`**, celle dont un `aliasParSite[]` (n'importe quel
   site, actif ou dans l'historique) a pour alias ce `CODE`. La recherche
   n'a pas besoin d'être scopée au site courant : le `CODE` est unique par
   type sur tout l'annuaire (voir plus haut) — c'est d'ailleurs cette même
   fonction de résolution, indépendante du site, qui est réutilisée telle
   quelle par M-12 (conversion manuelle d'un fichier hors contexte de
   site). Si aucune entité ne correspond (annuaire modifié entre-temps, tag
   halluciné), le tag reste affiché brut avec un style d'erreur distinct
   (voir UC-002, Cas d'erreur) — pas de substitution.
4. **Substitution**, dans le même passage (pas de phase intermédiaire où le
   tag brut resterait affiché) : le tag est remplacé par un `<span>` dont le
   contenu textuel est le nom réel, souligné (même style que M-05) ; le tag
   d'origine est conservé en `data-*` pour une infobulle inversée (survol →
   réaffiche `[TYP:CODE]`, utile en debug). Aucune écriture n'est réémise
   vers le site IA : uniquement le DOM local est modifié. Un tag déjà
   substitué (span déjà porteur de `data-fogbank-code`) est ignoré aux
   passages suivants — le passage complet est rejoué à chaque stabilisation,
   mais son coût reste négligeable même sur une conversation longue.

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
| M-01 | `options/` (onglet Sites, CRUD implémenté), `popup/` (bascule actif/inactif rapide sur le site courant) |
| M-02 | `options/` (onglet Annuaire, CRUD implémenté) |
| M-03, M-04, M-11 | `content/mention-menu.js` + `content/editor-handle/` |
| M-05 | `content/display.js` |
| M-06 | vestigial — aucun composant, voir Flux Envoi |
| M-07 | `content/reception.js` |
| M-08 | `content/content.js`, inline lors de l'insertion du tag (rotation paresseuse, pas de composant dédié) |
| M-09 | `fogbank.annuaire[].aliasParSite[].historique`, affiché via `options/` |
| M-10 | logique partagée (`content/pseudonyme.js`, utilisé par `mention-menu.js`, `reception.js` et `options/`) |
| M-12 | `options/` |
| M-13 | non implémenté — `vendor/xlsx.full.min.js` est vendored mais rien dans `options/` ne l'utilise encore |

## Travail restant

`chatgpt.js`/`claude.js` (adaptateurs dédiés à sélecteurs exacts) ont été
écrits puis mis de côté — toujours en échec après test sur les vrais sites
(voir bugs.md et « Adaptateurs de site », ci-dessus, pour l'historique).
Les fichiers ne sont plus chargés (retirés de `manifest.json`) mais restent
sur le disque : le relevé de sélecteurs qu'ils encodent
(`docs/recherche/constat-chatgpt.md`/`constat-claude.md`) reste utile si
l'approche page-entière actuelle s'avère elle-même insuffisante et qu'il
faut y revenir. Pas de `copilot.js` non plus, par le même raisonnement — le
repli générique couvre déjà tous les sites, y compris Copilot.

Cette réécriture (scan de toute la page, déclenché par stabilité —
voir Flux, Réception) n'a pas encore été validée sur les vrais sites : elle
répond au même besoin (« ça ne marche toujours pas ») avec un mécanisme
plus simple à raisonner (un seul `MutationObserver` debouncé, aucun
sélecteur à maintenir), mais reste à confirmer par test manuel sur
Claude.ai/ChatGPT/Copilot avant de la considérer acquise.

N'ajoute `transport`/`matchRecv` ni aucun champ réseau : ADR-007 a écarté
le hook réseau entier pour M-07 (voir Conséquences), et il n'a jamais été
retenu pour M-06 (fail-closed dès l'insertion). `tests/fixtures/` restent
utiles pour les régressions génériques sans dépendre des vrais sites.

## Statut

Composants communs (EditorHandle, calque de décoration, mention-menu,
réception, orchestration multi-champs) implémentés pour UC-001/UC-002 ;
l'approche page entière (section précédente) n'est pas encore vérifiée sur
les vrais sites. `options/` (CRUD annuaire + CRUD sites) et `popup/`
(statut/toggle du site courant, pause temporaire) sont implémentés. Reste à
faire : M-09 (historique de rotation, actuellement en storage mais pas
affiché dans `options/`), M-13 (export/import Excel, `vendor/xlsx.full.min.js`
vendored mais non branché).
