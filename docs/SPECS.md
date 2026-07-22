# Spécifications — fogbank

Ce document contient les spécifications publiques du projet, sous forme de
cas d'usage (UC). Il ne doit contenir **aucune donnée métier réelle** :
les exemples concrets, jeux de données et benchmarks vont dans
[`private/`](../private/README.md) (non versionné).

## Vue d'ensemble

fogbank est une extension Chrome qui permet de pseudonymiser à la volée des
entités sensibles citées dans un prompt destiné à une IA, puis de restaurer
automatiquement leurs valeurs réelles dans la réponse reçue — afin de ne
jamais envoyer de données personnelles/sensibles aux services IA tiers.

> **Mode fail-closed (voir [ADR-007](adr/0007-fail-closed.md))** : le tag
> `[TYP:CODE]` est ce que l'utilisateur tape et voit réellement dans le
> champ de saisie — c'est la source de vérité, jamais le vrai nom. Le vrai
> nom n'est **jamais écrit dans l'éditeur** ; il n'est que **décoré** à
> l'affichage (soulignement, infobulle, légende), dans une couche cloisonnée
> qui ne dépose rien dans le DOM du site. La mécanique ci-dessous décrit
> cette cible, déjà réécrite dans **UC-001**. **UC-002 reste à refondre** :
> son code, déjà implémenté, décrit encore l'ancien modèle fail-open — voir
> la note de statut en tête de son UC. Le code source (`src/`) des deux UC
> n'est pas encore aligné sur cette cible.

Quatre types d'entités sont pris en charge, chacun identifié par un
trigramme : **PER** (personne), **ORG** (organisation), **LIE** (lieu),
**PRJ** (projet). Le type est choisi manuellement par l'utilisateur au
moment de l'ajout (voir M-04) — pas de détection automatique. Le pseudonyme
conserve toujours le trigramme de type en clair (voir plus bas) afin que
l'IA comprenne la nature de l'objet substitué, même sans en connaître
l'identité réelle.

Mécanique générale (cible fail-closed, ADR-007) :
- Dans un champ de saisie d'un site autorisé, taper `&` ouvre un menu de
  sélection d'une entité (annuaire privé ou saisie libre d'une nouvelle
  entrée, avec choix du type). Voir [ADR-001](adr/0001-caractere-declencheur.md)
  pour le choix de ce caractère (et pourquoi ce n'est pas `@`).
- L'entité sélectionnée insère son tag `[TYP:CODE]` **directement dans le
  champ** — c'est ce qui part réellement au site IA, sans étape de
  substitution ultérieure. Une couche de décoration (calque + infobulle +
  légende sous le champ) souligne le tag et révèle le vrai nom au survol,
  sans jamais le déposer dans le DOM du site (voir ADR-007).
- **Aucun garde-fou ni détection d'un vrai nom tapé en clair** en dehors du
  menu `&` (décision explicite, voir UC-001 Contraintes et
  [ADR-007](adr/0007-fail-closed.md)) : fogbank protège ce qui passe par la
  mention, pas ce qui est tapé à côté. Limite assumée, à documenter
  clairement pour l'utilisateur.
- À la réception de la réponse, les pseudonymes détectés sont automatiquement
  remplacés par les valeurs réelles correspondantes pour l'affichage (M-07,
  inchangé dans son objectif — voir ADR-007 pour le changement de mécanisme).
- Le pseudonyme est toujours tagué avec son type sous la forme
  `[TYP:CODE]`, `TYP` étant un trigramme (ex: `[PER:PDT]`, `[ORG:ACM]`)
  afin que l'IA reconnaisse la nature de l'entité malgré la substitution —
  voir [ADR-003](adr/0003-typage-entites.md).
- Le `CODE` est généré selon un format configuré **par site** (M-01) et
  commun à toutes les entités qui y sont mentionnées : **reconnaissable**
  (dérivé des initiales du nom, ex: `PDT` ou `PIDU` pour Pierre Dupont —
  voir M-10 et [ADR-002](adr/0002-format-pseudonyme.md)) ou **opaque**
  (aléatoire, sans lien visuel avec le nom réel). Une même entité peut donc
  avoir un style différent selon le site. En cas de collision entre deux
  entités du même type générant le même code reconnaissable, un suffixe
  numérique est ajouté automatiquement (ex: `PDT`, `PDT-2`). Cette unicité
  du code est **globale, tous sites confondus** (pas seulement sur le site
  où l'entité est ajoutée) : c'est nécessaire pour que M-12 (conversion
  manuelle d'un fichier) puisse résoudre un pseudonyme sans avoir à
  connaître le site d'origine du fichier.
- Chaque pseudonyme a une durée de vie configurable **par site** (1 semaine,
  1 trimestre, 1 an, ou infini — paramètre associé à l'entrée de la liste
  autorisée, voir M-01) ; à expiration, un nouveau pseudonyme est généré pour
  la même entité sur ce site, mais l'historique complet des alias déjà
  attribués est toujours conservé (traçabilité, ré-association d'anciennes
  réponses).

Périmètre : liste blanche uniquement (pas de mode liste noire). Par défaut,
l'extension n'est active nulle part, à l'exception des grands sites IA
connus — **ChatGPT, Claude.ai, Copilot grand public**
(`copilot.microsoft.com`) — pré-activés à l'installation. L'utilisateur
peut ajouter volontairement d'autres sites. Voir
[ADR-004](adr/0004-portee-permissions.md).

**Microsoft 365 Copilot reste hors périmètre pour l'instant** : produit
distinct de Copilot grand public (domaines et backend différents), dont le
corpus tenant (documents, mails, messages) est interrogé en grande partie
hors du prompt lui-même — voir
[docs/recherche/constat-copilot.md](recherche/constat-copilot.md) §0 et §6,
et [ADR-007](adr/0007-fail-closed.md).

En complément du flux automatique (`&` → envoi → réponse affichée), un
fichier généré par l'IA et téléchargé (ex: `.md`, `.csv`, `.txt`) peut
contenir des pseudonymes qui ne sont pas restaurés automatiquement (portée
hors du DOM surveillé par M-07). Une interface dédiée, déclenchée par un
geste explicite de l'utilisateur, permet de convertir manuellement un
fichier dans les deux sens — pseudonymiser ou restaurer — voir M-12.

### Hors périmètre (version open source)

La version publiée sous AGPL-3.0 est volontairement **mono-utilisateur,
mono-poste** :

- Pas de partage d'annuaire entre plusieurs utilisateurs.
- Pas de synchronisation entre plusieurs machines (stockage strictement
  local à l'installation, voir [ADR-005](adr/0005-stockage-local.md)).
- Pas de fusion/merge automatique entre deux annuaires importés.
- M-12/M-13 se limitent aux formats texte simples et à l'Excel (`.xlsx`) —
  pas de documents Office structurés (`.docx`, `.pptx`).

## Macro-UC (vue d'ensemble)

Liste de haut niveau, à décliner ensuite en UC détaillés avec le template
ci-dessous. Chaque macro-UC deviendra un ou plusieurs UC-XXX.

| ID | Macro-UC | Résumé |
|----|----------|--------|
| M-01 | Gestion de la liste de sites autorisés | Configurer la whitelist des sites sur lesquels l'extension s'active (grands sites IA pré-activés + ajout manuel), avec pour chaque site sa durée de vie (M-08) et son format de pseudonyme (M-10) |
| M-02 | Gestion de l'annuaire privé | Créer/modifier/supprimer les entités (personne, organisation, lieu, projet) de l'annuaire, stocké localement dans le navigateur ([ADR-005](adr/0005-stockage-local.md)) ; une entité a un alias indépendant par site (voir [ARCHITECTURE.md](ARCHITECTURE.md)) et, pour une personne, un email facultatif |
| M-03 | Déclenchement du menu `&` | Ouvrir le menu de sélection à la frappe de `&` dans un champ autorisé (voir [ADR-001](adr/0001-caractere-declencheur.md)) |
| M-04 | Ajout à la volée depuis `&` | Créer une nouvelle entité directement depuis le menu si elle n'existe pas encore dans l'annuaire, avec sélection manuelle obligatoire de son type ; **insère le tag `[TYP:CODE]` dans le champ, pas le vrai nom** (fail-closed, [ADR-007](adr/0007-fail-closed.md)) |
| M-05 | Calque de décoration de la mention | **Redéfini par ADR-007** : le champ contient le tag `[TYP:CODE]` en clair ; une couche de décoration cloisonnée (shadow root fermé) le souligne et révèle le vrai nom — une **légende sous le champ comme base** (liste `[TYP:CODE] → nom réel`, ne dépend d'aucune mesure géométrique), une **infobulle au survol comme raffinement** (R-43) — jamais en l'écrivant dans le DOM du site, l'inverse du comportement fail-open initial |
| M-06 | Envoi sans réécriture | **Redéfini par ADR-007, et volontairement minimal** : rien n'est réécrit dans l'éditeur au moment de l'envoi (le tag est déjà la source de vérité depuis M-04). **Aucun garde-fou, aucune détection** d'un vrai nom resté en clair (écart assumé par rapport à `docs/recherche/reco.md` R-50 à R-53) — voir UC-001, Contraintes |
| M-07 | Restauration automatique à la réception | Détecter les pseudonymes dans la réponse et les remplacer par les noms réels. Inchangé dans son objectif ; mécanisme **DOM uniquement** (`MutationObserver`) sur les trois sites — pas de hook réseau, écarté pour rester simple (voir UC-002, ADR-007) |
| M-08 | Durée de vie / rotation du pseudonyme | Générer un nouveau pseudonyme quand l'alias est utilisé après expiration de la durée configurée pour le site concerné (M-01) — rotation paresseuse à l'usage, pas de tâche périodique |
| M-09 | Historique des alias | Conserver la trace de tous les pseudonymes jamais attribués à chaque entité, **par site**, y compris expirés |
| M-10 | Génération du pseudonyme | Générer le pseudonyme `[TYP:CODE]` selon le format configuré **pour le site courant** (M-01, commun aux 4 types sur ce site) : reconnaissable (initiales, plusieurs variantes) ou opaque (aléatoire), avec suffixe numérique automatique en cas de collision |
| M-11 | Typage de l'entité | Faire choisir manuellement le type (PER/ORG/LIE/PRJ) à l'utilisateur lors de l'ajout, et le conserver en clair (trigramme) dans le tag du pseudonyme |
| M-12 | Conversion manuelle de fichiers générés | Interface dédiée, déclenchée manuellement, pour pseudonymiser ou restaurer le contenu d'un fichier téléchargé (.md, .csv, .txt...) dans les deux sens ; le fichier proposé porte un infixe avant l'extension d'origine (`rapport.txt` → `rapport.fog.txt` ou `rapport.unfog.txt`) |
| M-13 | Export / import de l'annuaire (Excel) | Exporter l'annuaire et son historique vers un fichier `.xlsx` local, et importer un tel fichier pour peupler ou mettre à jour l'annuaire |
| M-14 | Mode « vision site » _(différé, non spécifié)_ | Bascule volontaire affichant les pseudonymes bruts tels que le site IA les voit réellement, sans restauration — voir TODO dans UC-002 |

_Statut : brouillon à valider avant de passer à l'architecture cible._

## Modèle de cas d'usage (template)

Copier ce squelette pour chaque nouveau cas d'usage.

---

### UC-XXX — Titre du cas d'usage

**Statut** : brouillon
**Macro-UC rattaché** : M-XX
**Dépendances** : _autres UC dont celui-ci dépend, s'il y en a_

**Déclencheur**
_Quel événement / action utilisateur déclenche ce cas d'usage ?_

**Résultat attendu**
_Quel est le comportement observable une fois le cas d'usage exécuté avec
succès ?_

**Données**
_Quelles données sont en entrée / sortie ? Sous quelle forme
(structure, type, provenance) ? Rester générique ici — pas de données
réelles._

**Cas d'erreur**
_Quels sont les cas limites ou d'échec, et le comportement attendu pour
chacun ?_

**Contraintes**
_Contraintes techniques, de performance, de sécurité ou de confidentialité
applicables à ce cas d'usage._

---

## Liste des cas d'usage

| ID     | Titre | Statut |
|--------|-------|--------|
| UC-001 | Mention `&` et insertion du tag `[TYP:CODE]` (fail-closed) | brouillon (fail-closed) — code (`src/`) encore fail-open, non aligné |
| UC-002 | Restauration à la réception (affichage lisible + traçabilité) | brouillon (fail-closed, mécanisme simplifié) — code (`src/`) encore fail-open, non aligné |

---

### UC-001 — Mention `&` et insertion du tag `[TYP:CODE]` (fail-closed)

> **Réécrit selon [ADR-007](adr/0007-fail-closed.md)** — remplace la
> précédente version de cet UC (fail-open : l'entité restait affichée en
> clair, substituée par son tag juste avant l'envoi). Le code actuel
> (`src/content/mention-menu.js`, `content.js`) implémente encore cette
> ancienne version et n'est pas aligné sur ce qui suit — refonte de code à
> faire, voir `docs/recherche/reco.md` §J pour l'ordre d'implémentation
> proposé (EditorHandle et calque d'abord, contre la fixture `<textarea>`).

**Statut** : brouillon (fail-closed)
**Macro-UC rattaché** : M-03, M-04 (sélection seulement), M-05, M-10
**Dépendances** : aucune

**Déclencheur**
L'utilisateur tape le caractère `&` dans un champ de saisie d'un site
autorisé — `<textarea>` ou `contenteditable`, indifféremment, via la
façade `EditorHandle` (voir [ARCHITECTURE.md](ARCHITECTURE.md)) — suivi de
texte de filtre.

**Résultat attendu**
1. Un menu de sélection s'ouvre sous le curseur, listant les entités de
   `fogbank.annuaire` dont le nom réel correspond au texte tapé après `&`
   (filtrage insensible à la casse, sous-chaîne).
2. La sélection d'une entité (clic ou Entrée) remplace `&filtre` par son
   tag `[TYP:CODE]`, inséré via `EditorHandle.replaceRange` (primitive
   `document.execCommand('insertText')`, seule à traverser le modèle
   interne de ProseMirror comme le tracker React d'un `<textarea>` — voir
   ADR-007) — **jamais le vrai nom**. C'est ce tag, et rien d'autre, qui
   sera transmis au site IA : aucune étape de substitution n'a lieu plus
   tard, contrairement à la version fail-open précédente.
   - Si l'entité n'a pas encore d'alias pour le site courant
     (`aliasParSite`), un nouvel alias est généré immédiatement (M-10 :
     format du site, unicité globale par type — voir
     [ADR-002](adr/0002-format-pseudonyme.md)) et persisté, pour que le tag
     inséré soit déjà correct dès la création de la mention.
3. Échap ferme le menu sans rien insérer ; le texte `&filtre` reste tel
   quel en clair dans le champ.
4. Le calque de décoration (racine shadow DOM fermée, voir ADR-007) marque
   le tag inséré. Deux mécanismes de lisibilité, l'un base, l'autre
   raffinement :
   - **Légende sous le champ** (base, R-43) : une ligne par tag
     actuellement présent dans le champ, au format
     `[TYP:CODE] → Nom réel`, mise à jour à chaque frappe. Ne dépend
     d'aucune mesure géométrique — reste lisible même si le calque de
     soulignement échoue à se positionner.
   - **Infobulle au survol du tag** (raffinement) : délai court (~180 ms),
     affiche le nom réel, le type en clair et l'email le cas échéant (3
     lignes maximum) ; verre dépoli, thème détecté depuis le site.
   - Soulignement bleu sur le tag lui-même : même token visuel que la
     version fail-open précédente (couleur, épaisseur) — c'est la mention
     qui change de support (le tag plutôt que le nom réel), pas le style.
5. À l'envoi (clic sur le bouton d'envoi détecté, ou raccourci natif du
   site), **rien n'est réécrit** : le contenu soumis est exactement celui
   du champ, tag compris, puisque c'est déjà ce qui y a été inséré à
   l'étape 2. Il n'y a plus de geste de substitution à l'envoi auquel
   accrocher la rotation paresseuse de M-08 — voir Contraintes.

**Données**
- Entrée : frappe clavier, texte tapé après `&`, position du curseur.
- Lecture : `fogbank.annuaire`, `fogbank.sites` (`chrome.storage.local`,
  voir [ADR-005](adr/0005-stockage-local.md)).
- Écriture : nouvel alias / historique ajouté à l'entité concernée si
  généré à la création de la mention.
- Sortie : contenu du champ modifié directement (tag inséré via
  `EditorHandle`) — c'est aussi, sans aucune transformation, ce qui part au
  site IA. Le calque de décoration (légende + infobulle) est un rendu
  séparé dans la racine shadow DOM fermée ; il ne modifie jamais le contenu
  du champ.

**Cas d'erreur**
- Aucune entité ne correspond au texte tapé → menu vide. Pas de création à
  la volée dans cet UC (M-04/M-11, différé à un UC suivant).
- Site non reconnu dans `fogbank.sites` (aucune entrée dont le domaine
  correspond à `location.href`) → le caractère déclencheur n'est pas
  intercepté, comportement natif du champ inchangé.
- L'utilisateur édite **à l'intérieur** d'un tag déjà inséré (ex : place le
  curseur entre `[PER:` et `PDT]` et tape) → le tag est corrompu dans le
  champ. La regex partagée (R-47) ne le matche plus : le calque le signale
  comme invalide (soulignement pointillé rouge, légende « tag invalide »),
  mais **rien n'empêche l'envoi** — voir Contraintes, pas de garde-fou dans
  cette version.
- L'utilisateur tape un vrai nom déclaré dans l'annuaire directement en
  clair, sans passer par `&` → **non détecté, non signalé**. Le nom part
  tel quel au site IA. Limite assumée, voir Contraintes.

**Contraintes**
- Façade `EditorHandle` obligatoire (deux implémentations :
  `TextareaHandle`, `ContentEditableHandle`) — aucun code fogbank ne touche
  l'élément de saisie brut (voir ARCHITECTURE.md). Contrairement à la
  version fail-open précédente, cet UC n'est **plus scopé au seul
  `contenteditable`** : `<textarea>` (Copilot) est couvert dès cette
  version, `EditorHandle` existant précisément pour unifier les deux.
- Suppression quasi atomique du tag : sur `Backspace`/`Delete` au bord ou à
  l'intérieur d'un tag, sélectionner et supprimer le tag entier d'un coup,
  pour éviter les fragments `[PER:PD` qui ne révèlent rien mais polluent le
  prompt et cassent la détection par regex.
- **Aucun garde-fou, aucune détection de vrai nom tapé en clair** —
  décision explicite qui s'écarte de `docs/recherche/reco.md` R-50 à R-53
  (qui recommandaient une détection continue + un blocage à l'envoi) :
  fogbank ne protège que ce qui passe effectivement par le menu `&`. Un
  vrai nom tapé manuellement en dehors de ce flux part sans avertissement.
  Limite à documenter clairement dans le README utilisateur.
- Calque de décoration : racine shadow DOM **fermée**, hôte anodin, aucune
  ressource externe, `pointer-events: none`, propriétés de peinture
  uniquement sur le soulignement — détail complet partagé avec UC-002 dans
  [ARCHITECTURE.md](ARCHITECTURE.md).
- Regex de tag partagée avec UC-002 et M-12 :
  `\[(PER|ORG|LIE|PRJ):([A-Z0-9]+(?:-\d+)?)\]`.
- Rotation paresseuse (M-08) : sans geste de substitution à l'envoi,
  l'expiration d'un alias est vérifiée **à chaque insertion d'un tag pour
  une entité donnée** (étape 2 ci-dessus) — c'est le seul point d'ancrage
  retenu. La résolution pour la légende/l'infobulle reste, elle, en lecture
  seule et ne déclenche jamais de rotation.
- Pas encore d'application de la whitelist de sites (M-01) : le site
  courant est simplement recherché dans `fogbank.sites`, sans UI de
  gestion — l'activation/désactivation par whitelist est un UC séparé.
- À tester contre
  [tests/fixtures/mock-ai-site/index.html](../tests/fixtures/mock-ai-site/index.html)
  (scénarios A **et** B, désormais tous deux dans le périmètre de cet UC),
  avec l'annuaire de
  [tests/fixtures/annuaire-exemple.json](../tests/fixtures/annuaire-exemple.json)
  chargé dans `chrome.storage.local`.

---

### UC-002 — Restauration à la réception (affichage lisible + traçabilité)

> **Simplifié après ADR-007** : `docs/recherche/reco.md` recommandait un
> **hook réseau entrant** (`fetch`/SSE en monde `MAIN`) sur ChatGPT et
> Claude.ai pour cet UC (R-54 à R-56), avec repli `MutationObserver` réservé
> à Copilot (R-58). **Décision : trop complexe pour le gain, non retenue.**
> fogbank reste sur un **mécanisme DOM unique pour les trois sites** —
> sensiblement ce qu'implémente déjà `content/reception.js` (fail-open), à
> confirmer/étendre plutôt qu'à remplacer. Autre changement : le marquage
> pendant le streaming (phase 1 ci-dessous) devient un **bonus best-effort**,
> pas un requis — fogbank peut ne rien faire tant que la réponse n'est pas
> stable. Voir [ADR-007](adr/0007-fail-closed.md) Conséquences.

**Statut** : brouillon (fail-closed, mécanisme simplifié) — proche du code
actuel (`src/content/reception.js`), à valider/étendre aux trois sites
**Macro-UC rattaché** : M-07 (Restauration automatique à la réception)
**Dépendances** : M-04 (le tag `[TYP:CODE]` est ce qui part réellement au
site IA depuis l'insertion — voir UC-001), M-10 (génération du code)

**Déclencheur**
L'utilisateur envoie un prompt contenant un ou plusieurs tags `[TYP:CODE]`
insérés via le menu `&` (voir UC-001). Le site IA commence à retourner sa réponse dans
la zone de réponse observée par l'adaptateur de site actif. La réponse peut
contenir zéro, un ou plusieurs tags de la forme `[TYP:CODE]`.

**Résultat attendu**

Mécanisme **DOM uniquement** (`MutationObserver` sur
`getResponseContainer()` de l'adaptateur actif), le même pour ChatGPT,
Claude.ai et Copilot — pas de hook réseau (voir note de statut ci-dessus).
Une seule étape est garantie ; le marquage pendant le streaming est un
bonus optionnel.

*Pendant le streaming (best-effort, pas requis)*

- fogbank peut ne rien faire tant que la réponse n'est pas stable — ce
  n'est pas une régression, c'est le comportement de base accepté.
- S'il est implémenté (comme c'est déjà le cas dans `content/reception.js`),
  le marquage best-effort suit le même principe qu'avant : chaque tag
  complet `[TYP:CODE]` repéré dans le texte streamé est stylisé en mention
  interactive (soulignement discret, **mêmes tokens visuels que M-05**),
  sans remplacer le texte ; l'infobulle au survol montre le nom réel déjà
  résolu. Aucune garantie que ce marquage suive fidèlement chaque frappe du
  modèle — c'est un confort, pas un contrat.

*Une fois la réponse stable (requis)*

- Détection : signal dédié de l'adaptateur (`isStreaming`/`onStreamingEnd`,
  ex. disparition d'un bouton « stop ») si disponible, sinon repli par
  délai d'inactivité du `MutationObserver` (déjà implémenté dans
  `generic.js`, ~400 ms) — ou immédiatement si la réponse arrive d'un coup
  (pas de streaming à observer).
- Passage unique : chaque tag `[TYP:CODE]` complet est résolu via
  l'annuaire (type + CODE, voir [ARCHITECTURE.md](ARCHITECTURE.md), flux
  Réception) et remplacé dans le DOM par le **nom réel** correspondant.
- Le nom réel remplacé reste stylisé (soulignement discret) pour indiquer
  qu'il s'agit d'une valeur restaurée par fogbank. Au **survol**, l'infobulle
  affiche cette fois le **tag `[TYP:CODE]`** effectivement reçu — utile pour
  vérifier/debug/expliquer (traçabilité).

Rationale : l'utilisateur veut lire la réponse dans son propre vocabulaire ;
la substitution devient l'affichage par défaut dès que possible, sans
exiger de mise en scène particulière pendant que ça streame encore.

**Données**

Entrée :
- Contenu textuel streamé dans la zone de réponse (`getResponseContainer()`
  de l'adaptateur actif).
- Annuaire `fogbank.annuaire[]` en lecture pour la résolution
  `type + CODE → { nomReel, siteId d'origine }`.

Sortie :
- DOM de la zone de réponse modifié :
  - Marquage best-effort (optionnel, pendant le streaming) : tags
    remplacés par des `<span>` stylisés porteurs des attributs
    `data-fogbank-type`, `data-fogbank-code`, `data-fogbank-nom` (utilisés
    par l'infobulle et par la substitution finale).
  - Substitution finale (requise, une fois la réponse stable) : contenu
    textuel du span remplacé par `nomReel`, attribut `data-fogbank-tag`
    ajouté avec la valeur `[TYP:CODE]` d'origine (pour l'infobulle
    inversée).
- Aucune écriture vers le site IA (le DOM affiché est modifié localement,
  la substitution n'est **pas** réémise dans la conversation).

Non-écriture en storage :
- La restauration ne modifie ni `fogbank.annuaire[]` ni `fogbank.sites[]`.
  Elle est purement présentation.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Tag `[TYP:CODE]` reçu mais aucune entité correspondante dans l'annuaire (ex : annuaire modifié entre l'envoi et la réception, ou tag halluciné par le modèle) | Le tag reste affiché brut, soulignement discret différencié (ex : pointillé rouge), infobulle indiquant « pseudonyme inconnu ». Pas de substitution finale. Pas d'erreur bloquante. |
| Type valide mais CODE inconnu pour ce type | Idem : traité comme un pseudonyme inconnu, aucun remplacement. |
| Tag mal formé (ex : `[per:PDT]` en minuscule, `[PER:PD T]` avec espace) | Non détecté par la regex, laissé brut sans marquage. À documenter comme comportement attendu (pas de tentative de correction). |
| Fin de streaming non détectée par l'adaptateur (ni signal dédié, ni inactivité) | La substitution finale ne s'exécute pas. L'utilisateur reste sur le texte brut (marqué ou non selon que le best-effort a eu lieu). Comportement dégradé mais fonctionnel. À logger pour diagnostic. |
| Réponse ne contenant aucun tag | Aucune action de fogbank ; DOM inchangé. Pas de badge, pas de log. |
| Utilisateur qui édite/répond avant fin du streaming | Substitution finale déclenchée quand même à la détection de fin du streaming courant. |
| Modèle qui réécrit un tag corrompu (ex : `[PER-PDT]`) | Non détecté, laissé brut. Cas à surveiller en pratique. |

**Contraintes**

Décision (cette session) :
- **Pas de hook réseau** pour M-07, contrairement à `docs/recherche/reco.md`
  R-54 à R-56 (jugé trop complexe pour le gain). Le mécanisme DOM déjà
  implémenté pour cet UC devient définitif, pour les trois sites — pas
  seulement le repli Copilot. Corollaire assumé : un re-rendu React qui
  écrase le marquage exige un nouveau passage du `MutationObserver` (déjà
  prévu), et une conversation rechargée (page déjà rendue, aucune mutation
  à observer) ne déclenche pas `onStreamingEnd` toute seule — voir Points
  ouverts.
- Le marquage pendant le streaming (ex-phase 1) est **best-effort, pas
  requis** : simplifie l'implémentation, pas d'obligation de distinguer
  précisément une mutation "texte en cours de streaming" d'une mutation
  "fin de génération".
- **Décision — historique/SPA** : deux cas distincts pour revenir sur une
  conversation existante, traités différemment :
  - **Rechargement réel de la page (F5)** : le content script se réinjecte
    au chargement, ce qui *est* le signal — le passage initial déjà fait
    par `reception.js` (aujourd'hui : marquage best-effort seulement) doit
    aussi déclencher la substitution finale à ce moment-là.
  - **Changement de conversation en SPA (`pushState`, sans reload)** :
    ChatGPT, Claude.ai et Copilot ne rechargent jamais le document pour
    changer de conversation (voir les constats) — le content script ne se
    réinjecte pas, il n'y a donc rien à détecter de ce côté. **Décision :
    rien de spécial** — on compte sur le `MutationObserver` déjà attaché à
    `getResponseContainer()` pour capter le changement (valable si le site
    garde le même conteneur et ne fait que remplacer ses enfants, ce qui
    est le cas React le plus courant). Pas de surveillance dédiée de
    `pushState`/`replaceState` comme R-16 le fait pour le champ de saisie —
    à vérifier empiriquement par site ; si le conteneur est remplacé en
    entier plutôt que ses enfants, ce cas resterait non couvert, à
    reconsidérer alors.

Techniques :
- Contrat d'adaptateur de site (voir [ARCHITECTURE.md](ARCHITECTURE.md),
  § Adaptateurs de site), déjà implémenté dans `generic.js` :
  ```
  isStreaming(container): boolean
  onStreamingEnd(container, callback): void
  ```
  Un adaptateur dédié (`chatgpt.js`, `claude.js`, `copilot.js`) peut fournir
  un signal plus précis et plus rapide (ex : disparition d'un bouton
  « stop », attribut `data-is-streaming`) ; `generic.js` reste sur le délai
  d'inactivité `MutationObserver` (~400 ms), seul repli sans signal dédié.
- Un tag est considéré complet quand la regex `\[(PER|ORG|LIE|PRJ):[A-Z0-9-]+\]`
  matche entièrement dans le texte. Éviter le marquage prématuré sur un tag
  partiellement streamé (`[PER:PD` — pas encore de crochet fermant).
- Les `<span>` insérés doivent survivre aux re-renders du site IA. Certains
  sites (Claude.ai notamment) reconstruisent leur DOM au fil du streaming ;
  le MutationObserver doit re-marquer si nécessaire. Point de vigilance non
  résolu ici : insérer un `<span>` dans un sous-arbre rendu par React ajoute
  un nœud, ce qui peut provoquer un `NotFoundError` au prochain re-rendu du
  composant si React ne s'attend pas à cette structure (R-59 recommande de
  ne remplacer que le contenu d'un nœud texte existant) — à surveiller lors
  des tests, pas nécessairement à corriger dans cette itération.

Cohérence visuelle :
- Soulignement bleu **strictement identique** à M-05 (même couleur, même
  épaisseur, même offset). C'est un contrat fort : « souligné = touché par
  fogbank », des deux côtés du prompt.
- L'infobulle doit être non intrusive (délai ~150-200 ms, cohérent avec
  UC-001 ; disparaît à sortie du survol).

Confidentialité :
- Aucun envoi réseau : la résolution est locale, l'infobulle est locale,
  la substitution est locale.
- L'infobulle ne doit pas être capturée par les mécanismes de copie/partage
  du site IA (ex : bouton « copier la réponse »). À vérifier par site :
  idéalement le span porte le `nomReel` comme contenu textuel visible et le
  tag en `data-*` — la copie standard renverra le nom réel, ce qui est le
  comportement souhaité pour un usage interne.

Performance :
- Marquage best-effort pendant le streaming : suffisamment léger pour ne pas
  ralentir le streaming s'il est implémenté (réponses parfois longues,
  mutations DOM fréquentes) — sinon, ne rien faire est toujours l'option la
  plus légère.
- Substitution finale : en un seul passage, pas de re-parsing continu.

Implémentation :
- Le repli générique (`generic.js`) détecte la zone de réponse comme le
  premier élément suivant le bouton d'envoi ne contenant lui-même aucun
  contrôle de saisie ; `isStreaming`/`onStreamingEnd` reposent uniquement
  sur un délai d'inactivité du `MutationObserver` (~400 ms), rappelé à
  chaque fin de rafale de mutations (pas seulement la première réponse
  d'une conversation).
- Testé contre
  [tests/fixtures/mock-ai-site/index.html](../tests/fixtures/mock-ai-site/index.html)
  (Scénario B, contenteditable), réception désormais automatique à l'envoi
  (voir le harnais de la fixture) : substitution finale immédiate en mode
  instantané, marquage best-effort puis substitution finale en mode
  streaming (via `fogbank:streaming-end`/inactivité).
- À étendre à
  [mock-claude-site](../tests/fixtures/mock-claude-site/index.html) et
  [mock-copilot-site](../tests/fixtures/mock-copilot-site/index.html)
  (ajoutés depuis, mécanisme DOM identique par construction) et au
  Scénario A (`<textarea>`) de `mock-ai-site`, maintenant dans le périmètre
  de cet UC au même titre que UC-001.

**Points ouverts**

- **Copie de la réponse** : quand l'utilisateur copie tout ou partie de la
  réponse (après substitution finale), copie-t-il le nom réel
  (comportement par défaut du DOM) ou le tag ? Reco : nom réel, cohérent
  avec le mode d'affichage. Fournir éventuellement un raccourci « copier
  avec pseudonymes » via menu contextuel — à trancher.
- **Édition manuelle** : si l'utilisateur édite sa réponse dans un site qui
  le permet (ex : Claude Artifacts), le marquage doit-il persister ?
  Comportement par défaut : non, les spans édités sont considérés comme
  texte libre.
- **Historique de conversation** : tranché, voir Contraintes (« Décision —
  historique/SPA »). Traité dans cet UC, pas de UC-002-B séparé.

**TODO — Mode « vision site »**

À traiter dans un UC dédié (proposition : voir M-14, différé).

Principe : bascule d'affichage volontaire (raccourci clavier + bouton dans
la popup) qui masque tous les noms réels et affiche uniquement les valeurs
pseudonymisées stylisées telles qu'elles existent côté site IA. Objectif :
permettre à l'utilisateur de vérifier à tout moment « qu'est-ce que le site
voit réellement ? » sans avoir à ré-envoyer un prompt.

Éléments à spécifier :
- Portée : uniquement la zone de réponse, ou aussi le champ de saisie
  (mentions marquées M-05) ?
- Portée temporelle : bascule instantanée sur la conversation courante, ou
  persistante tant que non désactivée ?
- Style spécifique en mode vision : les tags `[TYP:CODE]` doivent-ils être
  eux-mêmes stylisés (ex : fond gris pâle façon `<code>`) pour souligner
  qu'on regarde du contenu système ?
- Interaction avec la phase 2 de UC-002 : le mode vision force le rollback
  en phase 1, ou est un état parallèle indépendant.
- Raccourci clavier : à définir (proposition : `Alt+Maj+F` ou touche
  maintenue pour peek temporaire).
