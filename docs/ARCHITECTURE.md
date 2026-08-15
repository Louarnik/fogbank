# Architecture cible — fogbank

Ce document décrit l'architecture technique retenue pour implémenter les
macro-UC de [SPECS.md](SPECS.md). Les décisions structurantes avec
alternatives sont détaillées dans les ADR (`docs/adr/`) ; ce document en
donne la vue d'ensemble assemblée.

> **Side panel ([ADR-008](adr/0008-side-panel.md),
> [ADR-009](adr/0009-replication.md))** : le side panel est la surface
> principale de saisie et de lecture — le site n'est qu'une destination
> d'écriture, atteinte par écrasement total sur un ciblage explicite
> persistant par site.

## Principes directeurs

- **Tout local** : aucun backend applicatif, aucun appel réseau sortant
  hors des sites IA eux-mêmes. Persistance via `chrome.storage.local`
  ([ADR-005](adr/0005-stockage-local.md)).
- **Permissions minimales** : whitelist uniquement, pas d'accès large
  `<all_urls>` en cible ([ADR-004](adr/0004-portee-permissions.md)) — voir
  cependant § Permissions pour l'écart entre ce principe et le manifest
  actuel.
- **Vanilla JS, pas de bundler** : les rares dépendances (ex: SheetJS pour
  Excel) sont vendored en `src/vendor/`, chargées par balise `<script>`.
- **Séparation code / données sensibles** : le code (`src/`) ne contient
  jamais de données réelles ; `private/` reste réservé au développement/tests
  (voir [private/README.md](../private/README.md)) et n'a aucun rapport
  avec le stockage runtime de l'extension chez l'utilisateur final (qui vit
  dans `chrome.storage.local`, propre à chaque installation).
- **Le panneau est en clair, le site reçoit le pseudonymisé** ([ADR-008](adr/0008-side-panel.md)) :
  le champ de composition du panneau contient le vrai nom, jamais le tag —
  fogbank ne prend aucun risque à l'afficher en clair dans sa propre
  surface, jamais exposée au site. Le tag `[TYP:ALIAS]` n'existe qu'au
  moment de la réplication ([ADR-009](adr/0009-replication.md)), reconstruit
  à partir des mentions suivies par position — c'est lui, et seulement
  lui, qui atteint le champ du site.

## Composants de l'extension (Manifest V3)

```
src/
├── manifest.json
├── shared/
│   └── site-matching.js     # correspondance site/URL — partagée par ecriture.js, sidepanel.js et popup.js
├── background/
│   └── background.js        # service worker : menu contextuel, ouverture du panel
├── content/
│   ├── ecriture.js           # seul content script de production — ciblage, écrasement, lecture de page
│   ├── profils-lecture.js    # tours par site, lecture seule, best-effort (voir ADR-011) — jamais de ciblage/écriture
│   ├── editor-handle/        # façade de saisie — le champ du panneau est un <div contenteditable>
│   │   └── contenteditable-handle.js  #   Range/getClientRects natifs, texte gardé plat (voir fichier)
│   ├── display.js            # calque de décoration : racine shadow DOM fermée, infobulle (montre le tag), soulignement — chargé par le panneau, pas par le site
│   ├── mention-menu.js       # menu déclenché par "&" (M-03/M-04) : insère le tag via EditorHandle — chargé par le panneau
│   └── pseudonyme.js         # génération/résolution d'alias + regex de tag partagée (M-10) — chargé par le panneau
├── sidepanel/                 # surface principale : composition, décoration, ciblage, réplication, lecture
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
├── options/                  # deux onglets : Annuaire (CRUD entités) et Sites (CRUD fogbank.sites)
│   ├── options.html
│   ├── options.js
│   └── options.css
├── popup/                    # statut du site courant, activer/désactiver, lien vers le panneau et options/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── vendor/                   # dépendances tierces vendored
│   ├── xlsx.full.min.js      # SheetJS CE, Apache-2.0 (voir ADR-006)
│   └── fonts/                # Barlow/Barlow Condensed (SIL OFL), voir fonts/README.md
└── icons/
```

`editor-handle/`, `display.js`, `mention-menu.js` et `pseudonyme.js` sont
chargés par `sidepanel/` : aucun n'a besoin de savoir sur quelle page il
s'exécute, seul l'`EditorHandle` qu'on leur passe compte.

| Composant | Rôle | Macro-UC couverts |
|-----------|------|--------------------|
| `content/editor-handle/` | Façade de saisie pour le `<div contenteditable>` du panneau (`getText`, `replaceRange`, `getRangeRects`...) | M-04 |
| `content/mention-menu.js` | Détecte `&`, affiche le menu, insère le tag `[TYP:ALIAS]` via l'`EditorHandle` — attaché au champ du panneau | M-03, M-04, M-11 |
| `content/display.js` | Calque de décoration cloisonné (shadow DOM) : infobulle (montre le tag au survol d'un nom réel), soulignement — attaché au champ du panneau | M-05 |
| `content/pseudonyme.js` | Génération de code opaque (M-10), résolution inverse, regex de tag partagée, résolution de texte (M-07) — chargé par le panneau | M-07, M-10 |
| `content/ecriture.js` | Ciblage persistant par site, écrasement total, lecture de la page (hors champs de saisie), détection de modification externe | M-15, M-16, M-07 |
| `content/profils-lecture.js` | Identification best-effort des tours de conversation par site (voir ADR-011) — lecture seule, repli automatique si aucun profil ne correspond | M-07 |
| `sidepanel/` | Orchestration principale : champ de composition (`&` + décoration), statut de ciblage, mode de réplication (manuel/auto) avec témoin de synchro, bouton copier, affichage de la réponse résolue | M-03 à M-07, M-10, M-15, M-16 |
| `background/background.js` | Cycle de vie de l'extension, menu contextuel (« écrire ici »), ouverture du panel sur clic | M-15 |
| `options/` | Deux onglets : CRUD de l'annuaire (entités), CRUD des sites (`fogbank.sites`) — actif/inactif, mode de réplication | M-01, M-02 |
| `popup/` | Statut du site de l'onglet actif (reconnu/non, actif/inactif) avec bascule directe, lien vers le panneau et les deux onglets de `options/` | M-01 |
| `vendor/xlsx.full.min.js` | Lecture/écriture de fichiers `.xlsx` en local (prévu, pas encore branché à `options/`) | M-13 |

La page d'options (`options_page` dans `manifest.json`) s'ouvre dans son
propre onglet plutôt qu'en popover : les tableaux d'annuaire et de sites
gagnent à disposer de tout l'espace d'un onglet. Le panel (`side_panel`
dans `manifest.json`) s'ouvre via `chrome.sidePanel.open({ tabId })`,
déclenché depuis le clic sur le menu contextuel (voir Flux, Ciblage) —
appel qui doit rester synchrone dans le geste utilisateur, avant tout
`await` (sans quoi l'API échoue silencieusement).

### Ergonomie du side panel

Disposition détaillée dans [SPECS.md](SPECS.md), § Ergonomie — implémentée
telle quelle dans `sidepanel/sidepanel.html`, de haut en bas :
`#section-banniere` (site/statut/synthèse réglages, 2 lignes) →
`#section-onboarding` (parcours de configuration, affiché seulement si
`configurationTerminee` est `false` — seule exception à la limite de 2
lignes) → `#section-lecture` (historique en clair, copier + localiser) →
`#section-composition` (champ `&` + réplication) → `#section-journal`
(`<details>` replié par défaut, debug uniquement).

« Localiser dans la page » a deux mécanismes selon le mode d'affichage de
l'historique (voir ADR-011) :
- **Mode bulles** (`fogbank:localiser-tour`, voir
  `content/profils-lecture.js`) : re-requête le sélecteur du profil de
  lecture au moment du clic et scrolle directement vers l'élément du tour
  concerné — fiable tant que la page n'a pas changé de structure entre la
  lecture et le clic.
- **Repli bloc unique** (`fogbank:localiser`, voir `content/ecriture.js`) :
  **v1 best-effort**, cherche tel quel, dans le texte visible hors champs
  de saisie, la sélection courante du panneau (ou les 200 premiers
  caractères de l'historique à défaut) — `scrollIntoView` + réutilisation
  de `flashCible` sur le premier nœud texte correspondant. Limite connue et
  non résolue : un texte fourni sous sa forme résolue (nom réel affiché
  dans le panneau) ne correspond pas au tag brut réellement présent sur la
  page — la recherche échoue dans ce cas, voir SPECS.md § Ergonomie.

### Pas d'adaptateur de site pour écrire

fogbank ne devine jamais un composer ou une zone de réponse par heuristique
ou sélecteur **pour y écrire** ([ADR-008](adr/0008-side-panel.md)) :
composition et lecture vivent dans le panneau, le site n'est atteint que
sur un ciblage **explicite** (clic droit) et persistant. Pas de dossier
`site-adapters/` ni de contrat d'adaptateur d'écriture
(`matches`/`getInputFields`/`getResponseContainer`/`isStreaming`/
`onStreamingEnd`).

**Nuance côté lecture** ([ADR-011](adr/0011-lecture-par-tour.md)) :
`content/profils-lecture.js` identifie best-effort les tours de
conversation par site, mais **exclusivement en lecture** — jamais pour
cibler un champ ni écrire.

## Modèle de données (`chrome.storage.local`)

Voir [ADR-005](adr/0005-stockage-local.md) pour la justification du choix
de stockage.

```js
// fogbank.config
{
  caractereDeclencheur: "&"                // voir ADR-001
}

// fogbank.sites[]
{
  id: string,
  domaine: string,                         // ex: "chatgpt.com"
  preActive: boolean,                      // true pour les grands sites IA (ADR-004)
  actif: boolean,
  creeLe: string,                          // ISO date, création de l'entrée
  modeReplication: "manuel" | "auto",       // défaut "manuel", M-16
  cibleEcriture: {                          // descripteur best-effort, M-15 ; null si jamais ciblé
    id: string | null,
    tag: string,                            // tagName, ex: "TEXTAREA"
    role: string | null,
    ariaLabel: string | null,
    placeholder: string | null
  } | null,
  configurationTerminee: boolean            // false tant que le parcours d'onboarding n'est pas passé une fois ; le panneau l'affiche tant que false, sans jamais bloquer la composition
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
      idDiscussion: string | null,          // signal de discussion à l'attribution (M-08, ADR-012) ; non pertinent (toujours réutilisé) si le site est en politique "jamais"
      historique: [
        { alias: string, attribueLe: string, idDiscussion: string | null }
      ]
    }
  ]
}
```

Une même entité a un alias **indépendant par site** : elle peut ne pas
encore être utilisée sur tel site, avoir un alias actif sur tel autre, et
un historique de rotation propre à chacun.

En revanche, l'**unicité du `CODE`** (pour un `type` donné) est **globale**,
tous sites confondus — ce n'est *pas* scopée par site (raison détaillée
dans [ADR-002](adr/0002-format-pseudonyme.md)). La génération d'un nouvel
alias (M-10) vérifie donc l'absence de collision dans **tout**
`fogbank.annuaire` (tous les `aliasParSite[].historique` de toutes les
entités du même `type`, quel que soit le site), pas seulement dans le site
courant.

Le **format de génération** est toujours **opaque** sur cette branche (voir
[ADR-002](adr/0002-format-pseudonyme.md)) — ni configurable par site, ni
caractéristique de l'entité. Le choix par site (formats reconnaissables
inclus) vit sur `feature/choix-rotation-format`.

Le pseudonyme réellement inséré dans le prompt est composé à la volée à
partir de l'entité et du site courant :
`` `[${type}:${aliasParSite[siteId].aliasActif}]` `` (ex: `[PER:PDT]`).

`cibleEcriture` n'est jamais une référence DOM (elle ne survivrait pas à
un rechargement) : c'est un descripteur best-effort utilisé par
`content/ecriture.js` pour retrouver le champ au chargement suivant — voir
Flux, Ciblage.

**Entité par défaut « Paris, France »** (voir UC-005, Données) : présente
dans `fogbank.annuaire[]` dès l'installation (`id: "ent-defaut-paris"`,
`type: "LOC"`, code fixe `PA0001` — pas généré par M-10, pour que le test
d'envoi du parcours de configuration insère toujours le même tag).
`assurerAliasParisPourTousLesSites` (dupliquée en `background.js` et
`options.js`, même contrainte module/script classique que
`shared/site-matching.js`) garantit, de façon idempotente, un
`aliasParSite` pour chaque site — `idDiscussion: null` (voir
[ADR-012](adr/0012-rotation-par-discussion.md)) : cet alias n'est jamais le
fruit d'un usage réel, `idDiscussion` reste donc distinct de toute vraie
discussion, pour que la rotation paresseuse (M-08) s'applique dès la
première mention réelle de « Paris ».

## Flux principaux

**Composition (M-03/M-04/M-05, dans le panneau, en clair — voir UC-001)**
1. Le panneau attache, à son unique champ de composition
   (`<div contenteditable>` propre à fogbank), un `EditorHandle`
   (`ContentEditableHandle`), `mention-menu.js` et `display.js`.
2. `mention-menu.js` écoute la frappe du caractère déclencheur et filtre par
   texte tapé via `rechercherEntites`, un callback fourni par `sidepanel.js`
   (fermeture sur sa variable `annuaire` locale, elle-même chargée depuis
   `chrome.storage.local` et tenue à jour par `chrome.storage.onChanged`) —
   `mention-menu.js` ne lit jamais le storage lui-même.
3. Sélection (M-04) → le **vrai nom** de l'entité est inséré **directement
   dans le champ du panneau** via `EditorHandle.replaceRange` — jamais le
   tag. L'alias (`CODE`) pour le site **actuellement ciblé** (ou, à
   défaut, le site correspondant à l'onglet actif) est généré/récupéré au
   même moment (rotation paresseuse, voir plus bas) et gardé avec l'entité
   dans une **mention
   suivie par position** (`{debut, fin, entite, code}`,
   `mention-menu.js#attacher` en garde la liste) — c'est cette liste, pas
   le texte lui-même, qui permet de reconstruire le tag à la réplication
   (voir ci-dessous). Chaque frappe ultérieure décale ou abandonne les
   mentions suivies selon qu'elle touche ou non leur plage (préfixe/
   suffixe commun entre texte avant/après, voir `trouverPlageEditee`) ;
   Backspace/Delete au bord ou à l'intérieur d'une mention la supprime
   entière (suppression atomique), et une frappe normale strictement à
   l'intérieur est bloquée — mêmes protections que l'ancien modèle
   fail-closed appliquait au tag, désormais au nom réel.
4. `display.js` lit cette même liste de mentions (`obtenirMentions()`, pas
   de reparcours du texte par regex) et met à jour le soulignement de
   chaque nom, dans le panneau uniquement ; l'infobulle au survol montre
   le tag `[TYP:ALIAS]` correspondant.

**Ciblage (M-15, persistant par site — voir UC-003)**
1. Clic droit sur un champ éditable du site → menu contextuel (« fogbank :
   écrire ici », `contexts: ["editable"]`). `background.js` ouvre le panel
   (`chrome.sidePanel.open`, appelé en premier, de façon synchrone), puis
   — séquencé avant l'envoi du message de ciblage, pour éviter une course
   entre les deux écritures de `fogbank.sites` — vérifie si un site
   correspond déjà au domaine de l'onglet ; sinon en crée un avec des
   réglages par défaut et `configurationTerminee: false` (voir
   « Configuration d'un site » ci-dessous). Un message est ensuite envoyé
   au content script de l'onglet.
2. `content/ecriture.js` capture `document.activeElement` (le clic droit a
   placé le focus dessus), calcule un descripteur (`id`, `tag`, `role`,
   `aria-label`, `placeholder`). La sauvegarde dans
   `fogbank.sites[].cibleEcriture` relit `fogbank.sites` au moment même de
   l'écriture plutôt que de réutiliser une correspondance de site mise en
   cache au chargement de la page — nécessaire pour que le ciblage d'un
   site tout juste créé (étape précédente) soit bien persisté et non perdu
   faute de correspondance encore connue. Si le site ne correspond à
   aucune entrée (cas qui ne devrait plus arriver depuis l'auto-création
   ci-dessus, sauf site désactivé entre-temps), le ciblage reste local à
   la session.
3. Au chargement suivant d'une page du même site, `content/ecriture.js`
   tente de retrouver le champ via ce descripteur (par `id` d'abord, puis
   par correspondance `tag` + libellé) avant de se rabattre sur « aucune
   cible ».

**Configuration d'un site (M-01/M-15, onboarding — voir UC-005)**
- Deux points d'entrée créent une entrée `fogbank.sites[]` avec
  `configurationTerminee: false` : le clic droit sur un site inconnu
  (ci-dessus) et l'ajout manuel dans l'onglet Sites de `options/`.
- Tant que `configurationTerminee` est `false` pour le site actif, le
  panneau affiche un parcours guidé en plus de la zone de composition
  normale (jamais à sa place) : test d'écriture (réutilise l'écrasement de
  M-16), test d'envoi avec vérification de réponse (réutilise la lecture
  de M-07) — pas de préférences à choisir, rotation et format sont fixes
  sur cette branche.
- Le test d'envoi cherche la sous-chaîne « test bien reçu [LOC:PA0001] »
  (voir entité par défaut, ci-dessus) **deux fois** dans le texte extrait :
  la première occurrence localise le message de l'utilisateur, la
  **dernière** (pas nécessairement la deuxième, en cas de régénération) la
  réponse de l'IA — le panneau affiche alors le contexte autour de chaque
  position (`sidepanel.js#trouverOccurrences`/`extraireContexte`) pour
  validation visuelle.
- Suppression d'un site (`options/`) : purge aussi, dans
  `fogbank.annuaire[]`, tout `aliasParSite[]` référençant ce site — jamais
  de référence orpheline laissée derrière.

**Réplication (M-16, panneau → site — voir UC-004)**
1. Geste explicite (bouton « Envoyer ») ou anti-rebond ~300-400 ms après
   la frappe (mode auto, `fogbank.sites[].modeReplication === "auto"`).
2. `sidepanel.js#construireTexteTague` reconstruit, à partir du texte en
   clair du champ de composition et de la liste des mentions suivies
   (`mentionMenuHandle.obtenirMentions()`), la version où chaque mention
   est remplacée par son tag `[TYP:ALIAS]` — en traitant les mentions de la
   plus loin à la plus proche (tri décroissant sur `debut`) pour ne jamais
   invalider les décalages des remplacements suivants. C'est cette version
   taguée, et seulement elle, qui est envoyée au content script de
   l'onglet ciblé (message `fogbank:ecrire`) ; le bouton « copier »
   applique la même reconstruction avant d'écrire dans le presse-papier.
3. `content/ecriture.js` sélectionne tout le contenu existant du champ
   ciblé puis le remplace via `document.execCommand('insertText', false,
   texte)` — écrasement total, jamais une insertion au curseur. Le
   contenu final est relu et comparé au texte attendu (seule preuve
   fiable d'acceptation par le site, voir ADR-008).
4. Le panneau affiche un témoin de synchro (synchronisé / en attente /
   échec) et dégrade automatiquement le mode auto vers manuel après 1-2
   échecs consécutifs (session uniquement, pas persisté).
5. `content/ecriture.js` surveille aussi le champ ciblé (`input`) : un
   changement qui ne correspond pas à la dernière écriture de fogbank
   (modification externe) suspend la synchronisation automatique et le
   signale au panneau — panneau maître, voir ADR-009.
6. Un bouton « copier » (`navigator.clipboard.writeText`) reste disponible
   dans le panneau à tout moment, indépendamment du mode.

**Réception (M-07, affichage panneau — voir UC-002)**
1. `content/ecriture.js` pose un unique `MutationObserver` sur
   `document.body` (`childList`, `subtree`, `characterData`), débouncé à
   ~500 ms. Un premier passage est aussi planifié inconditionnellement au
   chargement, pour couvrir une page déjà entièrement rendue.
2. Une fois la page stable, extraction de tout le texte visible de
   `document.body` (`TreeWalker`, hors champs de saisie et UI flottante de
   fogbank) et diffusion au panneau (`fogbank:page-stable`).
3. Le panneau résout chaque tag `[TYP:ALIAS]` complet trouvé via l'annuaire
   (même regex/logique que `pseudonyme.js`) et affiche le texte résolu en
   lecture seule — remplacement textuel simple, **aucune écriture dans le
   DOM du site**. Un tag inconnu reste affiché tel quel.

**Rotation (M-08, [ADR-012](adr/0012-rotation-par-discussion.md)) — toujours par discussion, paresseuse, pas de tâche périodique**
- Pas de `chrome.alarms` ni de balayage périodique de tout l'annuaire :
  inutile de faire ce travail si l'alias n'est jamais réutilisé entre-temps.
  La vérification de validité se fait à la place **au moment où l'alias est
  effectivement utilisé**, lors de l'insertion d'une mention dans le
  panneau (Composition, étape 3) : comparaison de l'URL de l'onglet actif
  (proxy de l'identifiant de discussion, best-effort — voir ADR-012) à
  `idDiscussion` de l'`aliasParSite` concerné ; si différent, un nouvel
  alias est généré à la volée (unicité globale par type, voir plus haut)
  — l'ancien alias est ajouté à `historique` (jamais supprimé, M-09). Le
  choix d'une politique par site (ex: « jamais ») vit sur
  `feature/choix-rotation-format`.

**Export / import Excel (M-13)**
- Prévu dans `options.js` via `vendor/xlsx.full.min.js` — voir
  [ADR-006](adr/0006-export-import-excel.md) pour le format des feuilles.
  Non implémenté à ce jour (voir bugs.md).

## Permissions

Manifest actuel (`content_scripts` avec `matches: ["<all_urls>",
"file:///*"]`) : plus large que le principe « permissions minimales »
énoncé plus haut, qui reste une cible non atteinte dans cette itération.
[ADR-008](adr/0008-side-panel.md) envisage de remplacer ces `matches`
larges par `activeTab` + `contextMenus` (permission demandée au clic droit
plutôt qu'a priori) mais ce n'est **pas encore implémenté** — voir
[bugs.md](../bugs.md).

Permissions actuellement déclarées : `storage`, `unlimitedStorage`,
`tabs` (statut du site actif dans la popup/le panneau), `contextMenus`
(ciblage, voir M-15), `sidePanel` (ouverture du panel). Pas de permission
`alarms` (rotation paresseuse, voir M-08).

## Correspondance macro-UC → composants (synthèse)

| Macro-UC | Composant(s) principal(aux) |
|----------|------------------------------|
| M-01 | `options/` (onglet Sites, CRUD implémenté), `popup/` (bascule actif/inactif rapide sur le site courant), `sidepanel/` (parcours d'onboarding, voir UC-005) |
| M-02 | `options/` (onglet Annuaire, CRUD implémenté) |
| M-03, M-04, M-11 | `content/mention-menu.js` + `content/editor-handle/`, chargés par `sidepanel/` |
| M-05 | `content/display.js`, chargé par `sidepanel/` |
| M-06 | vestigial — absorbé par M-16 (réplication), voir Flux Composition/Réplication |
| M-07 | `content/ecriture.js` (extraction) + `content/profils-lecture.js` (tours par site, voir ADR-011) + `sidepanel/` (résolution et affichage, bulles ou bloc unique) |
| M-08 | `sidepanel/sidepanel.js`, inline lors de l'insertion d'une mention (rotation paresseuse, pas de composant dédié) |
| M-09 | `fogbank.annuaire[].aliasParSite[].historique` — déjà en storage, pas encore affiché dans `options/` (voir bugs.md) |
| M-10 | logique partagée (`content/pseudonyme.js`, utilisé par `sidepanel/` et `options/`) |
| M-13 | non implémenté — `vendor/xlsx.full.min.js` est vendored mais rien dans `options/` ne l'utilise encore |
| M-15 | `background.js` (menu contextuel, auto-création de site) + `content/ecriture.js` (ciblage, persistance, auto-repérage) + `sidepanel/` (onboarding, UC-005) |
| M-16 | `content/ecriture.js` (écrasement, détection de modification externe) + `sidepanel/` (mode, témoin de synchro, dégradation, copier) |

## Statut

Side panel implémenté comme surface principale (composition, décoration,
ciblage, réplication manuel/auto, lecture) — voir ADR-008/ADR-009 pour le
détail des décisions et `content/ecriture.js` pour l'implémentation côté
site. `options/` (CRUD annuaire + CRUD sites, avec mode de réplication) et
`popup/` (statut/toggle du site courant) sont implémentés. Aucun composant
ne cherche à identifier automatiquement un champ ou une zone sur le site.
Reste à faire : voir [bugs.md](../bugs.md).
