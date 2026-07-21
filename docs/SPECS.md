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

Quatre types d'entités sont pris en charge, chacun identifié par un
trigramme : **PER** (personne), **ORG** (organisation), **LIE** (lieu),
**PRJ** (projet). Le type est choisi manuellement par l'utilisateur au
moment de l'ajout (voir M-04) — pas de détection automatique. Le pseudonyme
conserve toujours le trigramme de type en clair (voir plus bas) afin que
l'IA comprenne la nature de l'objet substitué, même sans en connaître
l'identité réelle.

Mécanique générale :
- Dans un champ de saisie d'un site autorisé, taper `&` ouvre un menu de
  sélection d'une entité (annuaire privé ou saisie libre d'une nouvelle
  entrée, avec choix du type). Voir [ADR-001](adr/0001-caractere-declencheur.md)
  pour le choix de ce caractère (et pourquoi ce n'est pas `@`).
- L'entité sélectionnée reste affichée en clair dans le champ, mise en
  évidence (soulignement bleu) ; au survol, une infobulle montre le
  pseudonyme qui sera réellement envoyé.
- Au moment de l'envoi, les mentions marquées sont substituées par leur
  pseudonyme avant transmission au site IA.
- À la réception de la réponse, les pseudonymes détectés sont automatiquement
  remplacés par les valeurs réelles correspondantes pour l'affichage.
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
connus (ChatGPT, Claude.ai, ...) pré-activés à l'installation. L'utilisateur
peut ajouter volontairement d'autres sites. Voir
[ADR-004](adr/0004-portee-permissions.md).

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
| M-04 | Ajout à la volée depuis `&` | Créer une nouvelle entité directement depuis le menu si elle n'existe pas encore dans l'annuaire, avec sélection manuelle obligatoire de son type |
| M-05 | Marquage visuel de la mention | Afficher l'entité en clair, soulignée, avec infobulle montrant le pseudonyme (tag `[TYP:CODE]`) au survol |
| M-06 | Pseudonymisation à l'envoi | Substituer les mentions marquées par leur pseudonyme juste avant l'envoi du prompt |
| M-07 | Restauration automatique à la réception | Détecter les pseudonymes dans la réponse affichée et les remplacer par les noms réels |
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
| UC-001 | Mention `&` et pseudonymisation à l'envoi (contenteditable) | implémenté |
| UC-002 | Restauration à la réception (affichage lisible + traçabilité) | brouillon |

---

### UC-001 — Mention `&` et pseudonymisation à l'envoi (contenteditable)

**Statut** : implémenté
**Macro-UC rattaché** : M-03, M-04 (sélection seulement), M-05, M-06, M-10
**Dépendances** : aucune

**Déclencheur**
L'utilisateur tape le caractère `&` dans un champ `contenteditable` d'un
site autorisé, suivi de texte de filtre.

**Résultat attendu**
1. Un menu de sélection s'ouvre sous le curseur, listant les entités de
   `fogbank.annuaire` dont le nom réel correspond au texte tapé après `&`
   (filtrage insensible à la casse, sous-chaîne).
2. La sélection d'une entité (clic ou Entrée) remplace le texte `&filtre`
   par une mention marquée : span non éditable, soulignement bleu, nom réel
   affiché en clair, infobulle custom (délai court, ~150 ms, plus rapide
   que le `title` HTML natif) montrant le pseudonyme `[TYP:CODE]` qui sera
   envoyé.
   - Si l'entité n'a pas encore d'alias pour le site courant
     (`aliasParSite`), un nouvel alias est généré immédiatement (M-10 :
     format du site, unicité globale par type — voir
     [ADR-002](adr/0002-format-pseudonyme.md)) et persisté, pour que
     l'infobulle soit exacte dès la création de la mention.
3. Échap ferme le menu sans créer de mention ; le texte `&filtre` reste tel
   quel en clair dans le champ.
4. Au déclenchement de l'envoi (clic sur le bouton d'envoi détecté), chaque
   mention marquée présente dans le champ est remplacée par son tag
   `[TYP:CODE]` avant la soumission réelle. Si l'alias existant a expiré
   entre-temps (M-08), il est régénéré à ce moment (rotation paresseuse).

**Données**
- Entrée : frappe clavier, texte tapé après `&`, position du curseur.
- Lecture : `fogbank.annuaire`, `fogbank.sites` (`chrome.storage.local`,
  voir [ADR-005](adr/0005-stockage-local.md)).
- Écriture : nouvel alias / historique ajouté à l'entité concernée si
  généré à la création de la mention ou à la rotation.
- Sortie : DOM du champ modifié (span marqué), puis contenu réellement
  soumis (texte avec tag substitué) au moment de l'envoi.

**Cas d'erreur**
- Aucune entité ne correspond au texte tapé → menu vide. Pas de création à
  la volée dans cet UC (M-04/M-11, différé à un UC suivant).
- Site non reconnu dans `fogbank.sites` (aucune entrée dont le domaine
  correspond à `location.href`) → le caractère déclencheur n'est pas
  intercepté, comportement natif du champ inchangé.
- Champ non `contenteditable` (ex: `<textarea>`) → hors périmètre de cet
  UC ; support différé (voir Contraintes).
- Bouton d'envoi non détecté par l'adaptateur générique → aucune
  substitution n'est effectuée (pas de faux positif silencieux : à
  surveiller lors des tests).

**Contraintes**
- Scope volontairement restreint au `contenteditable` : un `<textarea>` ne
  peut pas afficher une portion de texte soulignée avec infobulle
  nativement ; le support `<textarea>` (overlay ou repli) sera un UC séparé.
- La création d'une nouvelle entité (M-04, avec choix du type M-11) est
  différée à un UC suivant : cet UC ne couvre que la sélection parmi les
  entités déjà existantes dans l'annuaire.
- Pas encore d'application de la whitelist de sites (M-01) : le site
  courant est simplement recherché dans `fogbank.sites`, sans UI de
  gestion — l'activation/désactivation par whitelist est un UC séparé.
- Testé contre
  [tests/fixtures/mock-ai-site/index.html](../tests/fixtures/mock-ai-site/index.html)
  (Scénario B, contenteditable), avec l'annuaire de
  [tests/fixtures/annuaire-exemple.json](../tests/fixtures/annuaire-exemple.json)
  chargé dans `chrome.storage.local`.

---

### UC-002 — Restauration à la réception (affichage lisible + traçabilité)

**Statut** : brouillon
**Macro-UC rattaché** : M-07 (Restauration automatique à la réception)
**Dépendances** : M-06 (substitution à l'envoi), M-05 (marquage visuel de la mention à l'envoi)

**Déclencheur**
L'utilisateur envoie un prompt contenant une ou plusieurs mentions
pseudonymisées (voir M-06). Le site IA commence à retourner sa réponse dans
la zone de réponse observée par l'adaptateur de site actif. La réponse peut
contenir zéro, un ou plusieurs tags de la forme `[TYP:CODE]`.

**Résultat attendu**

Le comportement se décompose en deux phases distinctes selon l'état du
streaming du site IA.

*Phase 1 — Pendant le streaming (réponse en cours de génération)*

- Le texte affiché conserve les tags bruts `[TYP:CODE]` tels qu'écrits par
  le modèle.
- Chaque tag est stylisé comme une mention interactive : soulignement bleu
  discret (**mêmes tokens visuels que M-05** à l'envoi — cohérence de la
  grammaire visuelle de fogbank).
- Au **survol** du tag, une infobulle affiche le **nom réel** correspondant,
  résolu via l'annuaire (recherche par type + CODE, voir
  [ARCHITECTURE.md](ARCHITECTURE.md), flux Réception).
- Aucun remplacement du texte n'est effectué durant cette phase.

Rationale : pendant le streaming, l'utilisateur voit fogbank « au travail »
— la présence des tags est la **preuve visible** que la pseudonymisation a
bien eu lieu. Le survol reste disponible pour la lisibilité ponctuelle.

*Phase 2 — À la fin du streaming (réponse complète)*

- Chaque tag `[TYP:CODE]` est remplacé dans le DOM par le **nom réel**
  correspondant.
- Le nom réel remplacé reste stylisé de la même manière (soulignement bleu
  discret) pour indiquer qu'il s'agit d'une valeur restaurée par fogbank.
- Au **survol** du nom réel restauré, l'infobulle affiche cette fois le
  **tag `[TYP:CODE]`** qui avait été effectivement reçu du site IA — utile
  pour vérifier / debug / expliquer.

Rationale : une fois la réponse figée, l'utilisateur veut lire dans son
propre vocabulaire ; la substitution devient l'affichage par défaut. Le
soulignement conservé + l'infobulle inversée assurent la traçabilité sans
encombrer la lecture.

*Détection de fin de streaming*

L'adaptateur de site est responsable de signaler la fin du streaming
(nouveau contrat à ajouter à l'interface commune — voir Contraintes). Sans
ce signal, la phase 2 ne peut pas être déclenchée. Deux heuristiques
possibles à préciser par adaptateur :
- Apparition d'un élément DOM propre au site indiquant la fin de génération
  (bouton « regénérer », icône d'état, disparition du curseur clignotant).
- Absence de mutation dans la zone de réponse pendant un délai configurable
  (fallback).

**Données**

Entrée :
- Contenu textuel streamé dans la zone de réponse (`getResponseContainer()`
  de l'adaptateur actif).
- Annuaire `fogbank.annuaire[]` en lecture pour la résolution
  `type + CODE → { nomReel, siteId d'origine }`.

Sortie :
- DOM de la zone de réponse modifié :
  - Phase 1 : tags remplacés par des `<span>` stylisés porteurs des
    attributs `data-fogbank-type`, `data-fogbank-code`, `data-fogbank-nom`
    (utilisés par l'infobulle et la phase 2).
  - Phase 2 : contenu textuel du span remplacé par `nomReel`, attribut
    `data-fogbank-tag` ajouté avec la valeur `[TYP:CODE]` d'origine (pour
    l'infobulle inversée).
- Aucune écriture vers le site IA (le DOM affiché est modifié localement,
  la substitution n'est **pas** réémise dans la conversation).

Non-écriture en storage :
- La restauration ne modifie ni `fogbank.annuaire[]` ni `fogbank.sites[]`.
  Elle est purement présentation.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Tag `[TYP:CODE]` reçu mais aucune entité correspondante dans l'annuaire (ex : annuaire modifié entre l'envoi et la réception, ou tag halluciné par le modèle) | Le tag reste affiché brut, soulignement discret différencié (ex : pointillé rouge), infobulle indiquant « pseudonyme inconnu ». Pas de remplacement en phase 2. Pas d'erreur bloquante. |
| Type valide mais CODE inconnu pour ce type | Idem : traité comme un pseudonyme inconnu, aucun remplacement. |
| Tag mal formé (ex : `[per:PDT]` en minuscule, `[PER:PD T]` avec espace) | Non détecté par la regex, laissé brut sans marquage. À documenter comme comportement attendu (pas de tentative de correction). |
| Fin de streaming non détectée par l'adaptateur | La phase 2 ne s'exécute pas. L'utilisateur reste en phase 1 (tags soulignés + infobulle survol). Comportement dégradé mais fonctionnel. À logger pour diagnostic. |
| Réponse ne contenant aucun tag | Aucune action de fogbank ; DOM inchangé. Pas de badge, pas de log. |
| Utilisateur qui édite/répond avant fin du streaming | Phase 2 déclenchée quand même à la détection de fin du streaming courant. |
| Modèle qui réécrit un tag corrompu (ex : `[PER-PDT]`) | Non détecté, laissé brut. Cas à surveiller en pratique. |

**Contraintes**

Techniques :
- Extension du contrat d'adaptateur de site (voir
  [ARCHITECTURE.md](ARCHITECTURE.md), § Adaptateurs de site) :
  ```
  isStreaming(container): boolean
  onStreamingEnd(container, callback): void  // ou événement équivalent
  ```
  Fallback dans `generic.js` : détection par délai d'inactivité
  MutationObserver.
- L'observation DOM (MutationObserver déjà prévu pour M-07) doit
  distinguer les mutations « ajout de texte streamé » (phase 1, marquage
  progressif des tags dès qu'ils sont complets) des mutations « fin de
  génération » (phase 2, substitution).
- Un tag est considéré complet quand la regex `\[(PER|ORG|LIE|PRJ):[A-Z0-9-]+\]`
  matche entièrement dans le texte. Éviter le marquage prématuré sur un tag
  partiellement streamé (`[PER:PD` — pas encore de crochet fermant).
- Les `<span>` insérés doivent survivre aux re-renders du site IA. Certains
  sites (Claude.ai notamment) reconstruisent leur DOM au fil du streaming ;
  le MutationObserver doit re-marquer si nécessaire.

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
- Phase 1 : le marquage doit être suffisamment léger pour ne pas ralentir
  le streaming (réponses parfois longues, mutations DOM fréquentes).
- Phase 2 : substitution en un seul passage à la fin, pas de re-parsing
  continu.

**Points ouverts**

- **Copie de la réponse** : quand l'utilisateur copie tout ou partie de la
  réponse (phase 2), copie-t-il le nom réel (comportement par défaut du
  DOM) ou le tag ? Reco : nom réel, cohérent avec le mode d'affichage.
  Fournir éventuellement un raccourci « copier avec pseudonymes » via menu
  contextuel — à trancher.
- **Édition manuelle** : si l'utilisateur édite sa réponse dans un site qui
  le permet (ex : Claude Artifacts), le marquage doit-il persister ?
  Comportement par défaut : non, les spans édités sont considérés comme
  texte libre.
- **Historique de conversation** : quand l'utilisateur revient sur une
  conversation antérieure (rechargement de la page), la phase 2 doit
  s'appliquer directement (pas de streaming à observer). L'UC couvre-t-il
  ce cas ou est-ce un UC séparé ? Reco : UC séparé
  (**UC-002-B — restauration au chargement d'une conversation
  existante**), même logique de résolution mais déclencheur différent.

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
