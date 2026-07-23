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

> **Side panel comme surface principale (voir [ADR-008](adr/0008-side-panel.md)
> et [ADR-009](adr/0009-replication.md))** : trois itérations successives
> d'injection directe dans le champ d'un site (heuristiques génériques,
> adaptateurs à sélecteurs exacts) ont toutes échoué sur les vrais sites
> (voir `bugs.md`). Le site n'est plus qu'une **destination d'écriture** :
> la composition (`&`, calque de décoration) et la lecture de la réponse
> (affichage résolu) vivent entièrement dans le **side panel**, une surface
> que fogbank contrôle à 100 %. Le champ du site n'est plus atteint que par
> **écrasement total** de son contenu, sur un ciblage explicite (clic droit
> → « écrire ici ») mémorisé par site. Validé par spike sur Claude.ai,
> ChatGPT et Copilot grand public (voir ADR-008).

Cinq types d'entités sont pris en charge, chacun identifié par un trigramme
aligné sur le schéma NER standard (voir [ADR-003](adr/0003-typage-entites.md)) :
**PER** (personne), **ORG** (organisation), **LOC** (lieu), **PRJ**
(projet, hors schéma NER standard mais propre au besoin de fogbank), **MISC**
(divers — catégorie fourre-tout, seul code à ne pas être un trigramme).
Le type est choisi manuellement par l'utilisateur au moment de l'ajout
(voir M-04) — pas de détection automatique. Le pseudonyme conserve toujours
le code de type en clair (voir plus bas) afin que l'IA comprenne la nature
de l'objet substitué, même sans en connaître l'identité réelle.

Mécanique générale (side panel, ADR-008/ADR-009) :
- Dans le panneau (pas dans le champ du site), taper `&` ouvre un menu de
  sélection d'une entité (annuaire privé ou saisie libre d'une nouvelle
  entrée, avec choix du type). Voir [ADR-001](adr/0001-caractere-declencheur.md)
  pour le choix de ce caractère (et pourquoi ce n'est pas `@`).
- L'entité sélectionnée insère son tag `[TYP:CODE]` **directement dans le
  champ du panneau** — jamais le vrai nom (fail-closed, voir
  [ADR-007](adr/0007-fail-closed.md)). Une couche de décoration (calque +
  infobulle + légende) souligne le tag et révèle le vrai nom au survol,
  **dans le panneau uniquement** — le site n'affiche jamais cette
  décoration, il ne voit que ce qui lui est répliqué.
- **Ciblage** : un clic droit sur un champ éditable du site (« écrire
  ici ») mémorise ce champ pour l'onglet courant **et** persiste un
  descripteur pour le site (`fogbank.sites[].cibleEcriture`), afin qu'un
  retour ultérieur sur le même site retrouve automatiquement le même champ
  sans repasser par un clic droit (voir M-15, UC-003).
- **Réplication** : le contenu du panneau est répliqué vers le champ ciblé
  par **écrasement total** (jamais une insertion au curseur), en mode
  manuel (bouton explicite) ou automatique (anti-rebond après la frappe,
  par site — voir M-16, UC-004). Un témoin de synchro et un repli
  presse-papier accompagnent les deux modes.
- **Aucun garde-fou ni détection d'un vrai nom tapé en clair** dans le
  panneau, en dehors du menu `&` (décision héritée d'ADR-007) : fogbank
  protège ce qui passe par la mention, pas ce qui est tapé à côté. fogbank
  ne contrôle pas non plus le bouton d'envoi du site : la garantie porte
  sur l'exactitude du témoin de synchro affiché, pas sur un blocage
  technique de l'envoi (voir ADR-009).
- À la réception de la réponse, fogbank lit tout le texte visible de la
  page (hors champs de saisie) et affiche, **dans le panneau**, sa version
  résolue (pseudonymes remplacés par les noms réels) — sans jamais écrire
  dans le DOM du site (voir M-07, UC-002).
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
[ADR-004](adr/0004-portee-permissions.md). Ce modèle de permission (liste
blanche a priori) reste inchangé par le pivot side panel — une permission
demandée au clic droit (`activeTab`/`contextMenus`) a été envisagée mais
non retenue faute de spike dédié, voir [ADR-008](adr/0008-side-panel.md).

**Microsoft 365 Copilot reste hors périmètre pour l'instant** : produit
distinct de Copilot grand public (domaines et backend différents), dont le
corpus tenant (documents, mails, messages) est interrogé en grande partie
hors du prompt lui-même — voir
[docs/recherche/constat-copilot.md](recherche/constat-copilot.md) §0 et §6,
et [ADR-007](adr/0007-fail-closed.md).

En complément du flux automatique (`&` → réplication → réponse affichée),
un fichier généré par l'IA et téléchargé (ex: `.md`, `.csv`, `.txt`) peut
contenir des pseudonymes qui ne sont pas restaurés automatiquement (portée
hors de ce que le panneau lit). Une interface dédiée, déclenchée par un
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
| M-01 | Gestion de la liste de sites autorisés | Configurer la whitelist des sites sur lesquels fogbank peut agir (grands sites IA pré-activés + ajout manuel), avec pour chaque site sa durée de vie (M-08), son format de pseudonyme (M-10) et son mode de réplication (M-16). Un nouveau site passe par un parcours de configuration guidé (**nouveau**, voir M-15, UC-005) avant d'être considéré prêt |
| M-02 | Gestion de l'annuaire privé | Créer/modifier/supprimer les entités (personne, organisation, lieu, projet, divers) de l'annuaire, stocké localement dans le navigateur ([ADR-005](adr/0005-stockage-local.md)) ; une entité a un alias indépendant par site (voir [ARCHITECTURE.md](ARCHITECTURE.md)) et, pour une personne, un email facultatif |
| M-03 | Déclenchement du menu `&` | **Redéfini par ADR-008** : ouvrir le menu de sélection à la frappe de `&` **dans le champ de composition du side panel**, plus dans le champ du site (voir [ADR-001](adr/0001-caractere-declencheur.md)) |
| M-04 | Ajout à la volée depuis `&` | Créer une nouvelle entité directement depuis le menu si elle n'existe pas encore dans l'annuaire, avec sélection manuelle obligatoire de son type ; **insère le tag `[TYP:CODE]` dans le champ du panneau**, pas le vrai nom (fail-closed, [ADR-007](adr/0007-fail-closed.md)) |
| M-05 | Calque de décoration de la mention | **Redéfini par ADR-008** : le champ de composition du panneau contient le tag `[TYP:CODE]` en clair ; une couche de décoration (shadow root fermé) le souligne et révèle le vrai nom — légende (base) + infobulle au survol (raffinement) — entièrement dans le panneau, jamais dans le DOM du site |
| M-06 | Envoi sans réécriture | **Vestigial, absorbé par M-16** : il n'y a plus de « geste d'envoi » distinct côté fogbank — c'est la réplication (M-16) qui détermine ce qui se trouve dans le champ du site au moment où l'utilisateur clique sur le bouton d'envoi du site. Aucun garde-fou, aucune détection d'un vrai nom resté en clair dans le panneau |
| M-07 | Restauration automatique à la réception | **Redéfini par ADR-008** : lire tout le texte visible de la page (hors champs de saisie) et afficher, **dans le panneau**, sa version résolue — plus aucune substitution dans le DOM du site |
| M-08 | Durée de vie / rotation du pseudonyme | Générer un nouveau pseudonyme quand l'alias est utilisé après expiration de la durée configurée pour le site concerné (M-01) — rotation paresseuse à l'usage, pas de tâche périodique |
| M-09 | Historique des alias | Conserver la trace de tous les pseudonymes jamais attribués à chaque entité, **par site**, y compris expirés |
| M-10 | Génération du pseudonyme | Générer le pseudonyme `[TYP:CODE]` selon le format configuré **pour le site courant** (M-01, commun aux 4 types sur ce site) : reconnaissable (initiales, plusieurs variantes) ou opaque (aléatoire), avec suffixe numérique automatique en cas de collision |
| M-11 | Typage de l'entité | Faire choisir manuellement le type (PER/ORG/LOC/PRJ/MISC) à l'utilisateur lors de l'ajout, et le conserver en clair dans le tag du pseudonyme |
| M-12 | Conversion manuelle de fichiers générés | Interface dédiée, déclenchée manuellement, pour pseudonymiser ou restaurer le contenu d'un fichier téléchargé (.md, .csv, .txt...) dans les deux sens ; le fichier proposé porte un infixe avant l'extension d'origine (`rapport.txt` → `rapport.fog.txt` ou `rapport.unfog.txt`) |
| M-13 | Export / import de l'annuaire (Excel) | Exporter l'annuaire et son historique vers un fichier `.xlsx` local, et importer un tel fichier pour peupler ou mettre à jour l'annuaire |
| M-14 | Mode « vision site » _(différé, non spécifié)_ | Bascule volontaire affichant les pseudonymes bruts tels que le site IA les voit réellement, sans restauration — voir TODO dans UC-002 |
| M-15 | Ciblage du champ d'écriture, persistant par site | **Nouveau (ADR-008)** : cibler un champ éditable du site par clic droit (« écrire ici »), mémoriser ce ciblage pour l'onglet courant et le persister par site pour un retrouvage automatique aux visites suivantes |
| M-16 | Réplication panneau → site | **Nouveau (ADR-009)** : répliquer le contenu du panneau vers le champ ciblé par écrasement total, en mode manuel ou automatique (par site), avec témoin de synchro, dégradation automatique et repli presse-papier |

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
| UC-001 | Mention `&` et insertion du tag `[TYP:CODE]` dans le panneau | réécrit (side panel, ADR-008) |
| UC-002 | Restauration à la réception — affichage panneau | réécrit (side panel, ADR-008) |
| UC-003 | Ciblage du champ d'écriture, persistant par site | nouveau (ADR-008) |
| UC-004 | Réplication du panneau vers le champ ciblé | nouveau (ADR-009) |
| UC-005 | Configuration d'un site (onboarding) | nouveau |

---

### UC-001 — Mention `&` et insertion du tag `[TYP:CODE]` dans le panneau

> **Réécrit selon [ADR-008](adr/0008-side-panel.md)** — remplace la version
> précédente de cet UC, où le menu `&` et le calque de décoration
> s'attachaient à un champ détecté sur le site lui-même. Code :
> `src/content/editor-handle/` (façade de saisie), `src/content/display.js`
> (calque de décoration), `src/content/mention-menu.js` (insertion du tag),
> `src/sidepanel/` (orchestration) — les trois premiers modules sont
> **réutilisés sans modification** : ils n'ont jamais eu besoin de savoir
> sur quelle page ils s'exécutaient, seulement quel `EditorHandle` leur est
> passé. Seul le champ auquel ils s'attachent change (celui du panneau, pas
> celui du site).

**Statut** : réécrit (side panel)
**Macro-UC rattaché** : M-03, M-04 (sélection seulement), M-05, M-10
**Dépendances** : aucune

**Déclencheur**
L'utilisateur tape le caractère `&` dans le champ de composition du side
panel — un `<textarea>` unique, propre à fogbank, via la façade
`EditorHandle` (voir [ARCHITECTURE.md](ARCHITECTURE.md)) — suivi de texte
de filtre. Ce champ existe et fonctionne **indépendamment** de tout
ciblage sur le site (voir UC-003) : on peut composer dans le panneau sans
avoir encore désigné de champ de destination.

**Résultat attendu**
1. Un menu de sélection s'ouvre sous le curseur, listant les entités de
   `fogbank.annuaire` dont le nom réel correspond au texte tapé après `&`
   (filtrage insensible à la casse, sous-chaîne).
2. La sélection d'une entité (clic, Entrée, Tab ou Espace) remplace
   `&filtre` par son tag `[TYP:CODE]`, inséré via `EditorHandle.replaceRange`
   — **jamais le vrai nom**. Le champ du panneau est un `<textarea>` natif
   contrôlé par fogbank : `EditorHandle.replaceRange` y écrit directement
   (`.value`), sans les contraintes de ProseMirror/Lexical qui motivaient
   `execCommand('insertText')` sur le site (voir ADR-007) — cette primitive
   reste néanmoins nécessaire côté réplication (UC-004), pour écrire dans
   le champ *du site*.
   - Si l'entité n'a pas encore d'alias pour le site **actuellement ciblé**
     (déterminé par l'onglet actif au moment de la frappe, voir UC-003), un
     nouvel alias est généré immédiatement (M-10 : format du site, unicité
     globale par type — voir [ADR-002](adr/0002-format-pseudonyme.md)) et
     persisté. Si aucun site actif ne correspond à l'onglet actif, le
     format par défaut (`fogbank.config.formatParDefaut`) est utilisé
     plutôt que de bloquer la frappe — composer dans le panneau ne doit
     jamais dépendre d'avoir déjà ciblé un champ.
3. Échap ferme le menu sans rien insérer ; le texte `&filtre` reste tel
   quel en clair dans le champ.
4. Le calque de décoration (racine shadow DOM fermée, voir ADR-007),
   attaché au champ du panneau, marque le tag inséré — légende (base,
   toujours au-dessus du champ) et infobulle au survol (raffinement,
   montre uniquement le nom réel), inchangés dans leur comportement par
   rapport à la version précédente de cet UC.

   Confirmation du menu par clavier : Entrée, Tab ou Espace, au choix.
   Le champ du panneau étant un `<textarea>` natif propre à fogbank (pas un
   éditeur tiers comme ProseMirror), la course d'écouteurs `keydown` qui
   motivait l'ajout d'Espace comme repli sur Claude.ai (voir ancienne
   version de cet UC) ne s'applique plus ici — conservé quand même par
   simplicité et cohérence d'interaction, aucun changement de comportement
   entre les trois touches à justifier.
   - Soulignement bleu sur le tag lui-même : même token visuel que M-07
     (voir UC-002) — contrat fort, « souligné = touché par fogbank », des
     deux côtés du prompt.
5. Le contenu du champ du panneau, tag compris, est ce qui sera répliqué
   vers le champ ciblé du site (voir UC-004) — sur geste explicite (mode
   manuel) ou après un court anti-rebond (mode auto). Il n'y a plus de
   « geste d'envoi » distinct côté fogbank : c'est la réplication qui
   détermine le contenu du champ du site au moment où l'utilisateur clique
   sur le bouton d'envoi du site lui-même (hors du contrôle de fogbank,
   voir ADR-009).

**Données**
- Entrée : frappe clavier dans le panneau, texte tapé après `&`, position
  du curseur.
- Lecture : `fogbank.annuaire`, `fogbank.sites` (`chrome.storage.local`,
  voir [ADR-005](adr/0005-stockage-local.md)) ; site courant déterminé par
  l'URL de l'onglet actif (voir `shared/site-matching.js`).
- Écriture : nouvel alias / historique ajouté à l'entité concernée si
  généré à la création de la mention.
- Sortie : contenu du champ du panneau modifié directement (tag inséré via
  `EditorHandle`). Le calque de décoration (légende + infobulle) est un
  rendu séparé dans la racine shadow DOM fermée, propre à la page du
  panneau ; il ne modifie jamais le contenu du champ, ni celui du site.

**Cas d'erreur**
- Aucune entité ne correspond au texte tapé → menu vide. Pas de création à
  la volée dans cet UC (M-04/M-11, différé à un UC suivant).
- Aucun site actif ne correspond à l'onglet actif au moment de la frappe →
  la frappe et l'insertion du tag fonctionnent quand même (voir Résultat
  attendu, point 2) ; c'est la réplication (UC-004) qui échouera faute de
  cible, pas l'insertion elle-même.
- L'utilisateur édite **à l'intérieur** d'un tag déjà inséré (ex : place le
  curseur entre `[PER:` et `PDT]` et tape) → le tag est corrompu dans le
  champ du panneau. La regex partagée (R-47) ne le matche plus : le calque
  le signale comme invalide (soulignement pointillé rouge), mais **rien
  n'empêche la réplication** — voir Contraintes.
- L'utilisateur tape un vrai nom déclaré dans l'annuaire directement en
  clair dans le panneau, sans passer par `&` → **non détecté, non
  signalé**. Le nom part tel quel à la réplication. Limite assumée, voir
  Contraintes.

**Contraintes**
- Façade `EditorHandle` toujours utilisée pour le champ du panneau, même si
  celui-ci est un `<textarea>` unique et connu à l'avance (pas de détection
  dynamique nécessaire côté panneau) — garde le code de `mention-menu.js`
  et `display.js` identique à ce qu'il était pour le site, aucune
  divergence à maintenir entre deux usages du même composant.
- Suppression quasi atomique du tag : sur `Backspace`/`Delete` au bord ou à
  l'intérieur d'un tag, sélectionner et supprimer le tag entier d'un coup,
  pour éviter les fragments `[PER:PD` qui ne révèlent rien mais polluent le
  prompt et cassent la détection par regex. Inchangé.
- **Aucun garde-fou, aucune détection de vrai nom tapé en clair** dans le
  panneau — décision héritée d'ADR-007 : fogbank ne protège que ce qui
  passe effectivement par le menu `&`. Limite à documenter clairement dans
  le README utilisateur.
- Calque de décoration : racine shadow DOM **fermée**, hôte anodin, aucune
  ressource externe, `pointer-events: none`, propriétés de peinture
  uniquement sur le soulignement — inchangé, partagé avec UC-002 dans
  [ARCHITECTURE.md](ARCHITECTURE.md). Fonctionne à l'identique dans une
  page d'extension (le panneau) que sur un site tiers — aucune adaptation
  requise.
- Regex de tag partagée avec UC-002 et M-12 :
  `\[(PER|ORG|LOC|PRJ|MISC):([A-Z0-9]+(?:-\d+)?)\]`.
- Rotation paresseuse (M-08) : l'expiration d'un alias est vérifiée **à
  chaque insertion d'un tag pour une entité donnée** (étape 2 ci-dessus),
  vis-à-vis du site actuellement ciblé (UC-003) ou, à défaut, du site
  correspondant à l'onglet actif.
- À tester contre
  [tests/fixtures/mock-ai-site/index.html](../tests/fixtures/mock-ai-site/index.html)
  comme destination de réplication (voir UC-004), avec l'annuaire de
  [tests/fixtures/annuaire-exemple.json](../tests/fixtures/annuaire-exemple.json)
  chargé dans `chrome.storage.local`.

---

### UC-002 — Restauration à la réception — affichage panneau

> **Réécrit selon [ADR-008](adr/0008-side-panel.md)**. Historique : la
> recommandation d'un hook réseau entrant (`docs/recherche/reco.md` R-54 à
> R-56) avait déjà été écartée par ADR-007 au profit d'un scan DOM ; ce scan
> a ensuite été étendu à toute la page (abandon de la notion de « zone de
> réponse », voir historique dans le fichier avant cette réécriture, ou
> `bugs.md`). **Ce que change ADR-008** : le résultat du scan n'est plus
> substitué dans le DOM du site — il est envoyé au panneau, qui l'affiche.
> Le site n'est plus jamais modifié par fogbank pour la restauration.
> Validé fonctionnellement en spike ; bruit de texte (contenu hors
> conversation) constaté mais non filtré — voir Cas d'erreur.

**Statut** : réécrit (side panel)
**Macro-UC rattaché** : M-07
**Dépendances** : M-04 (le tag `[TYP:CODE]` est ce qui part réellement au
site IA depuis la réplication — voir UC-001, UC-004), M-10 (génération du
code)

**Déclencheur**
L'utilisateur a répliqué (UC-004) un prompt contenant un ou plusieurs tags
`[TYP:CODE]` vers le site IA, qui affiche sa réponse quelque part dans la
page — fogbank ne cherche pas à savoir où. La réponse peut contenir zéro,
un ou plusieurs tags de la forme `[TYP:CODE]`.

**Résultat attendu**

Mécanisme **DOM uniquement**, un seul `MutationObserver` sur
`document.body` (content script, `content/ecriture.js`) pour toute la
page — le même pour tout site, pas de hook réseau.

- Chaque mutation reporte un minuteur de ~500 ms : tant que la page bouge,
  rien ne se passe. Un premier passage est aussi planifié
  inconditionnellement au chargement (couvre une conversation déjà rendue,
  sans aucune mutation à observer).
- Une fois la page stable, le content script extrait tout le texte visible
  de `document.body`, **hors champs de saisie** (`[contenteditable="true"],
  textarea` — jamais touchés, R-31), et l'envoie au panneau (message
  `fogbank:page-stable`).
- Le panneau résout chaque tag `[TYP:CODE]` complet trouvé via l'annuaire
  (même regex/logique que `pseudonyme.js`) et affiche le résultat en
  lecture seule — remplacement textuel simple (`String.replace`), pas de
  DOM à construire côté site puisque rien n'y est écrit.
- Un rafraîchissement manuel (bouton dans le panneau) reste possible pour
  forcer une relecture immédiate sans attendre la stabilisation.

Rationale : scanner toute la page dès qu'elle cesse de bouger reste le
mécanisme le plus robuste trouvé face à des sites dont la structure n'est
pas maîtrisée (voir historique dans ADR-008) ; afficher le résultat dans le
panneau plutôt que le substituer dans le DOM du site élimine en plus tout
risque d'interférence avec le rendu React/Vue du site (une insertion de
`<span>` dans un sous-arbre géré par un framework pouvait provoquer un
rendu incohérent côté site — jamais confirmé comme cause exacte, mais un
risque structurellement écarté par ce changement).

**Données**

Entrée :
- Tout le texte rendu de la page (`document.body`), hors champs de saisie.
- Annuaire `fogbank.annuaire[]` en lecture (côté panneau) pour la
  résolution `type + CODE → { nomReel, siteId d'origine }`.

Sortie :
- Zone d'affichage en lecture seule dans le panneau, texte résolu. Aucune
  écriture vers le site IA, ni dans son DOM ni dans son transport : la
  page du site n'est jamais modifiée par cet UC.

Non-écriture en storage :
- La restauration ne modifie ni `fogbank.annuaire[]` ni `fogbank.sites[]`.
  Elle est purement présentation.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Tag `[TYP:CODE]` reçu mais aucune entité correspondante dans l'annuaire (ex : annuaire modifié entre l'envoi et la réception, ou tag halluciné par le modèle) | Le tag reste affiché brut dans le texte résolu. Pas d'erreur bloquante. |
| Type valide mais CODE inconnu pour ce type | Idem : traité comme un pseudonyme inconnu, aucun remplacement. |
| Tag mal formé (ex : `[per:PDT]` en minuscule, `[PER:PD T]` avec espace) | Non détecté par la regex, laissé brut. Comportement attendu, pas de tentative de correction. |
| La page ne cesse jamais de bouger (animation continue, polling du site) | Le minuteur de stabilité ne se déclenche jamais ; le rafraîchissement manuel reste disponible en repli. |
| Texte extrait trop bruyant (navigation, barre latérale, contenu hors conversation — constaté en spike) | Non filtré dans cette itération : le panneau affiche tout, y compris du texte non pertinent. Dégradé mais fonctionnel ; à affiner (ex. limiter aux ancêtres contenant un tag) si ça s'avère gênant en usage réel. |
| Réponse ne contenant aucun tag | Le texte affiché dans le panneau est identique au texte brut de la page ; aucune erreur. |

**Contraintes**

- **Pas de hook réseau** pour M-07 (hérité d'ADR-007).
- **Pas de zone de réponse identifiée** : le scan porte sur `document.body`
  entier, sans tenter de délimiter une zone propre au site (hérité de la
  réécriture précédente de cet UC, inchangé par ADR-008 — seule la
  destination du résultat change, DOM du site → panneau).
- Un tag est considéré complet quand la regex
  `\[(PER|ORG|LOC|PRJ|MISC):[A-Z0-9-]+\]` matche entièrement dans le texte
  extrait.
- Exclusion explicite des champs de saisie actifs lors de l'extraction —
  sans elle, le tag encore visible dans un champ en cours de composition
  serait lui-même résolu et affiché, ce qui n'a pas de sens (il n'a pas
  encore été envoyé).
- Cohérence visuelle : le style utilisé pour un pseudonyme inconnu (s'il en
  reste un affiché tel quel) reste cohérent avec M-05, mais l'affichage
  étant désormais un simple bloc de texte dans le panneau (pas du DOM
  substitué avec `<span>` individuels), il n'y a plus d'infobulle inversée
  par tag — perte assumée de ce raffinement au profit de la simplicité
  (voir Points ouverts).

Performance :
- Un passage complet sur tous les nœuds texte de `document.body` à chaque
  stabilisation : accepté comme suffisamment léger même sur une
  conversation longue, à confirmer empiriquement si une page réelle
  s'avère plus volumineuse que prévu (voir Cas d'erreur, bruit constaté).

Implémentation :
- `content/ecriture.js` pose l'unique `MutationObserver`, extrait le texte,
  diffuse `fogbank:page-stable` ; `sidepanel/sidepanel.js` résout et
  affiche.
- Testé en spike contre Claude.ai, ChatGPT et Copilot grand public
  (extraction + résolution fonctionnelles) ; testé auparavant contre les
  trois fixtures (`mock-ai-site`, `mock-claude-site`, `mock-copilot-site`)
  pour la version précédente du scan (substitution DOM), mécanisme
  d'extraction inchangé depuis.

**Points ouverts**

- **Bruit du texte extrait** : voir Cas d'erreur — pas bloquant, mais un
  filtrage (ex. ne garder que le texte à proximité d'un tag trouvé, ou
  ignorer certains conteneurs connus comme navigation/sidebar) reste à
  envisager si l'usage réel s'avère gênant.
- **Infobulle par tag perdue** : l'ancienne version (substitution DOM avec
  un `<span>` par tag) permettait de survoler chaque nom restauré pour
  revoir son tag d'origine. L'affichage panneau (bloc de texte simple)
  n'offre plus ce raffinement — à réintroduire si jugé utile (ex.
  affichage tag par tag dans une liste séparée, comme la légende de M-05).
- **Historique de conversation / SPA** : inchangé — un rechargement réel
  (F5) comme un changement de conversation en SPA (`pushState`) sont
  couverts par le même mécanisme, sans traitement spécial (le passage de
  stabilisation planifié au chargement couvre une conversation déjà
  rendue ; le `MutationObserver` capte tout changement de contenu quel que
  soit le conteneur concerné, puisqu'aucun conteneur précis n'est
  identifié).

**TODO — Mode « vision site »**

À traiter dans un UC dédié (proposition : voir M-14, différé).

Principe : bascule d'affichage volontaire (raccourci clavier + bouton dans
la popup ou le panneau) qui masque tous les noms réels et affiche
uniquement les valeurs pseudonymisées stylisées telles qu'elles existent
côté site IA. Objectif : permettre à l'utilisateur de vérifier à tout
moment « qu'est-ce que le site voit réellement ? » sans avoir à ré-envoyer
un prompt.

Éléments à spécifier :
- Portée : uniquement l'affichage panneau de la réponse, ou aussi le champ
  de composition (mentions marquées M-05) ?
- Portée temporelle : bascule instantanée sur la session courante, ou
  persistante tant que non désactivée ?
- Style spécifique en mode vision : les tags `[TYP:CODE]` doivent-ils être
  eux-mêmes stylisés (ex : fond gris pâle façon `<code>`) pour souligner
  qu'on regarde du contenu système ?
- Raccourci clavier : à définir (proposition : `Alt+Maj+F` ou touche
  maintenue pour peek temporaire).

---

### UC-003 — Ciblage du champ d'écriture, persistant par site

> **Nouveau, [ADR-008](adr/0008-side-panel.md)**. Valide en spike (S2) sur
> Claude.ai, ChatGPT et Copilot grand public : le clic droit place bien le
> focus sur le champ visé avant que le gestionnaire de fogbank ne
> s'exécute, de façon fiable sur les trois. La persistance par site
> (auto-repérage au chargement suivant) n'a pas encore été testée en usage
> réel prolongé — voir Contraintes.

**Statut** : nouveau, implémentation en cours
**Macro-UC rattaché** : M-15
**Dépendances** : aucune

**Déclencheur**
L'utilisateur fait un clic droit sur un champ éditable du site (menu
contextuel natif, item « fogbank : écrire ici »), **ou** charge une page
d'un site déjà ciblé précédemment (auto-repérage, voir Résultat attendu).

**Résultat attendu**
1. Clic droit → `chrome.contextMenus` (contexte `editable`) → le service
   worker ouvre le side panel et envoie un message au content script de
   l'onglet.
2. Le content script capture `document.activeElement` (le navigateur place
   le focus sur le champ cliqué avant que le menu contextuel ne
   s'affiche — comportement natif, pas une supposition de fogbank).
3. Un descripteur du champ est calculé (best-effort, pas un sélecteur CSS
   unique et garanti) : `id`, `tag`, `role`, `aria-label`, `placeholder`/
   `data-placeholder`.
4. Si le site correspond à une entrée active de `fogbank.sites[]` (voir
   M-01), ce descripteur est persisté dans
   `fogbank.sites[].cibleEcriture` — sinon, le ciblage reste valable pour
   la session en cours (cet onglet, jusqu'au rechargement) sans être
   sauvegardé.
5. **Auto-repérage** : au chargement d'une page dont le site a un
   `cibleEcriture` enregistré, le content script tente de retrouver le
   même champ — par `id` en priorité (le plus fiable), puis par
   correspondance `tag` + (`aria-label` ou `placeholder`). Si trouvé, le
   ciblage est actif sans qu'un clic droit soit nécessaire. Sinon, aucun
   ciblage automatique — l'utilisateur doit re-cibler manuellement (la
   persistance n'est jamais présentée comme garantie).
6. Le panneau reflète l'état du ciblage (description courte du champ
   trouvé, ou « aucune cible ») dès qu'il est notifié d'un changement.

**Données**
- Entrée : clic droit + sélection du menu contextuel ; `document.activeElement`
  au moment de la capture.
- Lecture/écriture : `fogbank.sites[].cibleEcriture` (descripteur, pas une
  référence DOM — les références DOM ne survivent jamais à un rechargement
  de page).
- Sortie : état de ciblage tenu en mémoire par le content script de
  l'onglet (référence DOM vivante, invalide dès que l'élément quitte le
  DOM), diffusé au panneau pour affichage.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Clic droit sur un élément qui n'est finalement pas éditable (menu contextuel affiché par erreur) | `contexts: ["editable"]` empêche normalement ce cas — le menu n'apparaît que sur un champ éditable natif. |
| Site non reconnu dans `fogbank.sites` (aucune entrée dont le domaine correspond) | Le ciblage fonctionne pour la session (voir Résultat attendu, point 4) mais n'est pas persisté. |
| Auto-repérage au chargement échoue (site restructuré, id changé) | Aucun ciblage automatique ; le panneau affiche « aucune cible », l'utilisateur re-cible manuellement. Le descripteur périmé n'est pas effacé automatiquement — un nouveau clic droit le remplace. |
| Le champ ciblé disparaît du DOM après ciblage (changement de conversation, re-render complet) | Détecté par `!document.contains(cibleActuelle)` avant toute écriture (voir UC-004) ; le panneau signale la perte plutôt que d'échouer silencieusement. |
| Rechargement de page (F5) pendant qu'un ciblage session (site non whitelisté) était actif | Perdu, comportement attendu — seul le ciblage persisté par site survit à un rechargement. |

**Contraintes**
- Le descripteur n'est **pas** un sélecteur CSS unique garanti — c'est un
  ensemble d'indices utilisés dans un ordre de préférence (`id` d'abord).
  Un site qui change fréquemment de structure peut nécessiter un
  re-ciblage manuel régulier ; ce n'est pas traité comme un défaut mais
  comme une limite assumée du ciblage best-effort (le clic droit reste
  toujours disponible en repli).
- Pas de changement du modèle de permission dans cette itération : le
  ciblage n'est possible que sur un site où le content script est déjà
  chargé (matches larges existants), pas encore sur un domaine non couvert
  par une permission — voir [ADR-008](adr/0008-side-panel.md), passage à
  `activeTab`/`contextMenus` noté comme amélioration future.
- `chrome.sidePanel.open()` doit être appelé de façon synchrone dans le
  geste utilisateur (le clic sur le menu contextuel), avant tout `await` —
  un appel différé après une opération asynchrone perd le contexte de
  geste exigé par l'API (constaté pendant le spike, voir historique dans
  le code de `background.js`).

---

### UC-004 — Réplication du panneau vers le champ ciblé

> **Nouveau, [ADR-009](adr/0009-replication.md)**. Le mécanisme
> d'écrasement (S1) est validé sur Claude.ai, ChatGPT et Copilot grand
> public, y compris en rafale (plusieurs écrasements rapprochés sur le
> même champ). Le témoin de synchro, la dégradation automatique et la
> détection de modification externe (panneau maître) sont des
> comportements décidés par conception, pas encore éprouvés en usage réel
> prolongé.

**Statut** : nouveau, implémentation en cours
**Macro-UC rattaché** : M-16
**Dépendances** : UC-001 (contenu à répliquer), UC-003 (champ ciblé)

**Déclencheur**
Mode manuel : l'utilisateur clique sur « Envoyer » dans le panneau. Mode
auto (`fogbank.sites[].modeReplication === "auto"`) : la frappe s'arrête
dans le champ du panneau pendant ~300-400 ms.

**Résultat attendu**
1. Le panneau envoie le texte du champ de composition au content script de
   l'onglet ciblé (message `fogbank:ecrire`).
2. Le content script sélectionne tout le contenu existant du champ ciblé
   puis le remplace via `document.execCommand('insertText', false, texte)`
   — écrasement total, jamais une insertion au curseur (voir ADR-008).
3. **Vérification a posteriori** : le contenu du champ après écriture est
   relu et comparé au texte attendu. Une discordance (le site a réécrit
   par-dessus, ou l'a partiellement ignoré) est traitée comme un échec,
   même si `execCommand` a retourné succès — c'est la seule preuve fiable
   qu'un site a réellement accepté l'écriture (voir ADR-008, Contexte).
4. **Témoin de synchro** dans le panneau, trois états : *synchronisé* (la
   dernière vérification correspond), *en attente* (écriture en cours,
   mode auto avant l'anti-rebond), *échec* (discordance ou cible perdue).
5. **Mode auto uniquement** — dégradation automatique : après un ou deux
   échecs consécutifs, le mode repasse en manuel pour la session en cours
   (pas persisté dans `fogbank.sites[]`) et le signale explicitement dans
   le panneau, plutôt que de continuer à réessayer.
6. **Panneau maître** : le content script surveille le champ ciblé
   (événement `input`) et compare son contenu à la dernière valeur écrite
   par fogbank. Un écart (l'utilisateur a tapé directement dans le champ du
   site) suspend la synchronisation automatique et notifie le panneau,
   plutôt que d'écraser silencieusement cette saisie externe au prochain
   cycle.
7. **Repli presse-papier** : un bouton « copier » reste actif dans le
   panneau à tout moment, indépendamment du mode et de l'état du témoin —
   `navigator.clipboard.writeText` depuis le panneau, aucune dépendance au
   ciblage ou à l'état du site.

**Données**
- Entrée : texte du champ de composition du panneau ; référence en mémoire
  du champ ciblé (voir UC-003).
- Sortie : contenu du champ ciblé du site remplacé ; état de synchro
  affiché dans le panneau (pas persisté en storage, purement transitoire).
- Lecture/écriture : `fogbank.sites[].modeReplication` (lu au chargement du
  panneau et à chaque changement de site actif ; la dégradation en mode
  manuel après échecs n'écrit **pas** cette valeur, elle reste un état de
  session).

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Cible perdue (jamais définie, ou retirée du DOM depuis) | Message d'échec explicite au panneau, pas de tentative d'écriture. Témoin de synchro passe à *échec*. |
| `execCommand` renvoie succès mais le contenu final ne correspond pas au texte envoyé | Traité comme un échec (voir Résultat attendu, point 3) — le site a rejeté ou altéré l'écriture silencieusement à son niveau ; fogbank ne peut que le détecter, pas l'empêcher. |
| Écrasements rapprochés (mode auto, frappe continue avec anti-rebond court) | Validé par spike sur les trois sites réels — accepté sans échec sur les cas testés. Si un site s'avère n'accepter que le premier d'une rafale, dégradation automatique après 1-2 échecs (point 5) limite les dégâts. |
| Modification externe détectée pendant le mode auto | Synchronisation suspendue, message affiché (voir Résultat attendu, point 6) ; reprise sur action explicite de l'utilisateur (pas de reprise automatique silencieuse — recréerait le même risque). |
| L'utilisateur clique sur le bouton d'envoi du site alors que le témoin affiche *échec* ou *en attente* | Fogbank ne bloque pas ce clic (pas de contrôle sur le bouton du site, voir ADR-009) — le témoin est le seul avertissement. Limite assumée, à documenter. |
| `navigator.clipboard.writeText` échoue (permission refusée, contexte non sécurisé) | Message d'échec dans le panneau ; pas de repli supplémentaire — c'est déjà le repli de dernier recours. |

**Contraintes**
- Écrasement total uniquement — jamais une tentative d'insertion au
  curseur dans le champ du site (plus simple, c'est ce que S1 a validé).
- Anti-rebond (~300-400 ms) obligatoire en mode auto : une écriture par
  caractère tapé déclencherait un cycle de rendu du site à chaque frappe,
  en plus d'être inutile (voir ADR-009).
- La dégradation automatique et la suspension sur modification externe ne
  sont **jamais silencieuses** : chacune doit produire un message visible
  dans le panneau — c'est le principe fail-closed transposé à la
  réplication (voir ADR-009).
- Aucun contrôle du bouton d'envoi du site : fogbank n'intercepte ni
  `Enter` ni le clic sur le bouton d'envoi natif dans cette itération —
  contrairement à l'ancienne version fail-closed de UC-001 (qui, elle,
  s'attachait directement au champ du site). Ce n'est plus nécessaire
  puisque le contenu du champ est déjà correct au moment de l'écrasement ;
  c'en est aussi la limite (voir Cas d'erreur, avant-dernière ligne).
- `chrome.storage.onChanged` sur `fogbank.sites` doit garder le panneau à
  jour si le mode de réplication est changé depuis l'onglet Sites de
  `options/` pendant que le panneau est ouvert.

---

### UC-005 — Configuration d'un site (onboarding)

> **Nouveau**. Réunit M-01 (whitelist) et M-15 (ciblage, UC-003) en un seul
> parcours guidé, avec deux points d'entrée équivalents. Contrairement à
> UC-001/UC-003/UC-004, ce parcours ne s'exécute qu'une fois par site (tant
> que `configurationTerminee` reste `true`) — ce n'est pas un mécanisme
> déclenché à chaque usage.

**Statut** : nouveau, implémentation en cours
**Macro-UC rattaché** : M-01, M-15
**Dépendances** : UC-003 (ciblage), UC-004 (réplication, réutilisée pour le
test d'écriture), UC-002 (lecture de page, réutilisée pour la vérification)

**Déclencheur**

Deux points d'entrée équivalents, menant au même parcours :
1. Clic droit sur un champ éditable d'un site **absent** de
   `fogbank.sites[]` (« écrire ici ») — le site est créé automatiquement
   (domaine = nom d'hôte de l'onglet, réglages par défaut) et marqué
   `configurationTerminee: false`.
2. Ajout manuel d'un site dans l'onglet Sites de `options/` — même
   marquage ; le ciblage (étape 1 du parcours) ne peut se faire que plus
   tard, en visitant effectivement le site.

**Résultat attendu**

Le side panel affiche un parcours de configuration tant que
`configurationTerminee` vaut `false` pour le site actif — **en plus**,
pas à la place, de la zone de composition normale (le parcours n'est
jamais bloquant, voir Contraintes) :

1. **Ciblage** (voir UC-003) : déjà fait si on arrive par le clic droit ;
   sinon, le panneau invite à faire un clic droit sur un champ du site
   avant de continuer.
2. **Test d'écriture** : un bouton écrit un texte fixe et reconnaissable
   (« Test fogbank — écriture ») dans le champ ciblé, par le mécanisme
   d'écrasement déjà décrit en UC-004. L'utilisateur confirme
   visuellement que ce texte apparaît bien sur la page du site.
3. **Test d'envoi** : un bouton écrit, par le même mécanisme, un message
   invitant explicitement l'IA à répondre par une phrase fixe : « Ceci
   est un test, merci de répondre par « test bien reçu ». ». L'utilisateur
   envoie lui-même ce message depuis le site (fogbank ne contrôle pas son
   bouton d'envoi, voir ADR-009). Un bouton « Vérifier la réponse » relit
   ensuite la page (même mécanisme que UC-002, `fogbank:lire-clair`) et
   recherche la phrase attendue dans le texte extrait — trouvée, elle
   valide **à la fois** que l'écriture est bien passée jusqu'à l'IA et que
   la lecture de page fonctionne sur ce site, dans le même geste.
4. **Préférences** : durée de vie du pseudonyme (M-08) et format du
   pseudonyme (M-10), choisies dans le panneau — mêmes valeurs et mêmes
   options que le formulaire de l'onglet Sites de `options/`.
5. « Terminer la configuration » enregistre ces préférences et passe
   `configurationTerminee` à `true` : le parcours ne se réaffiche plus
   pour ce site. « Passer pour l'instant » masque le parcours pour la
   session en cours sans modifier `configurationTerminee` (il réapparaîtra
   à la prochaine ouverture du panneau sur ce site).

**Données**

Écriture dans `fogbank.sites[]` :
- Nouvelle entrée (points d'entrée 1 et 2), réglages par défaut
  (`dureeViePseudonyme: "1a"`, `formatPseudonyme: "court"`,
  `modeReplication: "manuel"`, `cibleEcriture: null`,
  `configurationTerminee: false`).
- Puis, au fil du parcours : `cibleEcriture` (étape 1, via UC-003),
  `dureeViePseudonyme`/`formatPseudonyme` (étape 4), `configurationTerminee`
  (étape 5).

Aucune écriture dans `fogbank.annuaire` par cet UC.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Clic droit sur un site dont le domaine correspond déjà à une entrée existante | L'entrée existante est réutilisée (correspondance par domaine) ; aucun doublon créé. |
| Test d'écriture : le texte n'apparaît pas sur la page | Aucun blocage technique — l'utilisateur reste sur cette étape, peut vérifier le ciblage (UC-003) ou réessayer. |
| Test d'envoi : phrase attendue introuvable à la vérification | Message d'échec, pas de blocage — l'IA a pu reformuler ou la réponse n'est pas encore arrivée (page pas encore stabilisée, voir UC-002) ; l'utilisateur peut réessayer la vérification ou passer à l'étape suivante s'il a constaté le succès de visu. |
| Site ajouté via `options/` sans qu'aucun onglet n'ait ce domaine ouvert | Le site est créé (`configurationTerminee: false`) mais le ciblage devra être fait plus tard, en visitant le site et en faisant un clic droit — pas d'erreur, juste un parcours interrompu à l'étape 1. |

**Contraintes**

- Le parcours n'est **jamais bloquant** : composer, cibler et répliquer
  restent possibles même en configuration incomplète, cohérent avec le
  fait qu'UC-003/UC-004 gèrent déjà proprement l'absence de ciblage ou
  l'échec de réplication sans bloquer la composition.
- Réutilise entièrement UC-003 (ciblage) et UC-004 (écrasement) pour les
  étapes 1-2, et le mécanisme de lecture de UC-002 pour l'étape 3 — aucun
  nouveau mécanisme d'écriture ou de lecture, seulement des textes fixes
  et une recherche de sous-chaîne.
- Le test d'envoi ne peut pas être automatisé de bout en bout : fogbank
  n'envoie pas le message à la place de l'utilisateur (pas de contrôle du
  bouton d'envoi du site, voir ADR-009) — seule la vérification de la
  réponse (étape 3, deuxième moitié) est automatique.

**Gestion du site (au-delà de la configuration initiale)**

Trois actions distinctes, disponibles depuis l'onglet Sites de `options/` :
- **Désactiver** (`actif = false`, déjà existant via M-01) : le site reste
  configuré, juste inactif — `content/ecriture.js` ne s'y exécute plus.
- **Retirer les réglages** : remet `cibleEcriture` à `null` et
  `configurationTerminee` à `false` — relance le parcours de configuration
  sans supprimer le site ni son historique d'alias dans l'annuaire.
- **Supprimer complètement** : retire l'entrée de `fogbank.sites[]` **et**
  purge, dans `fogbank.annuaire[]`, tout `aliasParSite[]` référençant ce
  site (avec son historique) — contrairement au comportement précédent
  (qui laissait des références orphelines, affichées par leur seul
  identifiant technique). Action irréversible, confirmée explicitement
  avant exécution.
