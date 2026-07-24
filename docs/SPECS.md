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

Le **side panel** est la surface principale (voir
[ADR-008](adr/0008-side-panel.md), [ADR-009](adr/0009-replication.md)) : le
site IA n'est qu'une **destination d'écriture**. La composition (`&`,
calque de décoration) et la lecture de la réponse (affichage résolu) vivent
entièrement dans le panneau, une surface que fogbank contrôle à 100 %. Le
champ du site n'est atteint que par **écrasement total** de son contenu,
sur un ciblage explicite (clic droit → « écrire ici ») mémorisé par site.

Cinq types d'entités sont pris en charge, chacun identifié par un trigramme
aligné sur le schéma NER standard (voir [ADR-003](adr/0003-typage-entites.md)) :
**PER** (personne), **ORG** (organisation), **LOC** (lieu), **PRJ**
(projet, hors schéma NER standard mais propre au besoin de fogbank), **MISC**
(divers — catégorie fourre-tout, seul code à ne pas être un trigramme).
Le type est choisi manuellement par l'utilisateur au moment de l'ajout
(voir M-04) — pas de détection automatique. Le pseudonyme conserve toujours
le code de type en clair (voir plus bas) afin que l'IA comprenne la nature
de l'objet substitué, même sans en connaître l'identité réelle.

**Principe directeur : le panneau est en clair, le site reçoit le
pseudonymisé.** Le panneau est la propre surface de fogbank, jamais
exposée au site — rien n'y est risqué à afficher en clair. Le tag
`[TYP:ALIAS]` n'existe qu'au moment de la réplication vers le site (voir
[ADR-009](adr/0009-replication.md)).

Mécanique générale :
- Dans le panneau (pas dans le champ du site), taper `&` ouvre un menu de
  sélection d'une entité (annuaire privé ou saisie libre d'une nouvelle
  entrée, avec choix du type). Voir [ADR-001](adr/0001-caractere-declencheur.md)
  pour le choix de ce caractère (et pourquoi ce n'est pas `@`).
- L'entité sélectionnée insère son **vrai nom, en clair, directement dans
  le champ du panneau** — jamais le tag. Une couche de décoration (calque +
  infobulle) souligne chaque nom ainsi inséré et révèle, au survol, le tag
  `[TYP:ALIAS]` qui sera envoyé au site — l'inverse de l'infobulle d'un
  champ fail-closed classique. Chaque mention est suivie par position
  (pas par un motif à reparcourir dans le texte, voir UC-001) : c'est cette
  liste qui permet de reconstruire, à la réplication, la version taguée.
- **Ciblage** : un clic droit sur un champ éditable du site (« écrire
  ici ») mémorise ce champ pour l'onglet courant **et** persiste un
  descripteur pour le site (`fogbank.sites[].cibleEcriture`), afin qu'un
  retour ultérieur sur le même site retrouve automatiquement le même champ
  sans repasser par un clic droit (voir M-15, UC-003).
- **Réplication** : le panneau reconstruit, à partir de son texte en clair
  et de la liste des mentions suivies, la version où chaque nom réel est
  remplacé par son tag `[TYP:ALIAS]` — c'est cette version taguée, et
  seulement elle, qui est écrite vers le champ ciblé, par **écrasement
  total** (jamais une insertion au curseur), en mode manuel (bouton
  explicite) ou automatique (anti-rebond après la frappe, par site — voir
  M-16, UC-004). Un témoin de synchro et un repli presse-papier
  accompagnent les deux modes ; le repli presse-papier copie lui aussi la
  version taguée, jamais le texte en clair.
- **Aucun garde-fou ni détection d'un vrai nom tapé en clair en dehors
  d'une mention suivie** : un nom tapé directement (sans passer par `&`)
  n'est jamais reconnu comme une mention, donc jamais retagué à la
  réplication — il part tel quel au site. fogbank protège ce qui passe par
  la mention, pas ce qui est tapé à côté. fogbank ne contrôle pas non plus
  le bouton d'envoi du site : la garantie porte sur l'exactitude du témoin
  de synchro affiché, pas sur un blocage technique de l'envoi (voir
  ADR-009).
- À la réception de la réponse, fogbank lit tout le texte visible de la
  page (hors champs de saisie) et affiche, **dans le panneau**, sa version
  résolue (pseudonymes remplacés par les noms réels) — sans jamais écrire
  dans le DOM du site (voir M-07, UC-002).
- Le pseudonyme est toujours tagué avec son type sous la forme
  `[TYP:ALIAS]`, `TYP` étant un trigramme (ex: `[PER:PDT]`, `[ORG:ACM]`)
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
peut ajouter volontairement d'autres sites, ou fogbank crée l'entrée
automatiquement au premier ciblage (voir M-15, UC-005). Voir
[ADR-004](adr/0004-portee-permissions.md).

**Microsoft 365 Copilot reste hors périmètre pour l'instant** : produit
distinct de Copilot grand public (domaines et backend différents), dont le
corpus tenant (documents, mails, messages) est interrogé en grande partie
hors du prompt lui-même.

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
- M-12/M-13 se limitent aux formats texte simples (`.md`, `.html`) —
  pas de documents Office structurés (`.xlsx`, `.docx`, `.pptx`).

## Ergonomie

**Référence visuelle** (source de vérité pour cette section) : prototype
HTML/CSS haute fidélité dans
[docs/design/side-panel-ergonomie/](design/side-panel-ergonomie/) — couleurs,
typographie, espacements et interactions du design system « Industry »,
définitifs, à recréer au pixel près dans `src/sidepanel/` en respectant ses
conventions actuelles (c'est une référence de valeurs, pas du code à
injecter tel quel — voir le README du dossier). Panneau à largeur fixe
392px, hauteur 100vh, colonne verticale.

Disposition du side panel (surface principale, voir ADR-008), du haut vers
le bas :

1. **Titre** : icône brouillard (Lucide, `stroke-width:1.5`, accent-700) +
   « fogbank », 20px, police de titre, `letter-spacing:-0.01em`.
2. **Bandeau de site** (cadre « blueprint » — bordure fine + 4 marques
   d'angle) :
   - Ligne 1 : nom de domaine (tronqué avec ellipsis) + tag de statut
     (Actif = teinte accent, Inactif = teinte neutre) à gauche ; 2 boutons
     icône à droite (« Configurer le site », « Rafraîchir le ciblage »).
   - Ligne 2, configuration terminée : synthèse des réglages en **2 lignes
     maximum** — « Rotation : *durée* » · « Alias : *format* » (M-08,
     M-10).
   - Variante configuration incomplète (voir UC-005) — **seule exception à
     la limite de 2 lignes** : liste des étapes du parcours (fait/en
     attente) + boutons « Continuer la configuration » / « Passer pour
     l'instant ».
3. **Historique de la conversation, en clair** (voir UC-002) — **zone
   extensible** (`flex:1`, occupe tout l'espace restant, seule zone du
   panneau à grandir/rétrécir avec la fenêtre) :
   - En-tête : « Historique — en clair » + bouton ghost « Lire
     maintenant ».
   - Cadre « blueprint » à ascenseur interne, **une bulle par tour de
     conversation** quand un profil de lecture identifie le site (voir
     UC-002, [ADR-011](adr/0011-lecture-par-tour.md)) : bordure gauche
     colorée par rôle (accent = « Vous », neutre = « Assistant »), tag de
     rôle, actions **copier** et **localiser** par bulle. **Repli bloc
     unique** (texte en monospace, actions copier/localiser globales
     au-dessus du cadre) si aucun profil ne correspond au site ou n'y
     trouve rien — jamais d'échec, seulement une dégradation.
   - **Conversion fichier** (M-12, voir UC-006), imbriqué dans ce même bloc
     sans padding latéral propre, aligné avec les autres en-têtes : bouton
     ghost « Convertir un fichier… » (visible seulement en mode manuel) +
     toggle « Conversion automatique au téléchargement » (avec note
     explicative quand actif).
4. **Composer, en clair** (voir UC-001/UC-004) :
   - En-tête « Composer » + toggle « Envoi automatique » (mode de
     réplication, M-16).
   - Champ de saisie à hauteur fixe (4 lignes, ascenseur interne si
     dépassement), déclencheur `&` + calque de décoration (même grammaire
     que l'historique).
   - Bandeau « Synchronisation suspendue » (conditionnel, teinte
     avertissement) si le champ du site a été modifié hors panneau, avec
     bouton « Reprendre ».
   - Barre d'action, justifiée aux extrémités :
     - **Pastille compteur** (gauche) : nombre d'entités actuellement
       mentionnées dans le composer, cliquable — déroule au-dessus d'elle
       la liste « Nom réel — `[TYP:ALIAS]` » des entités concernées (voir
       UC-001). N > 0 : teinte accent, icône œil-barré, libellé « N
       masqués » (pluriel accordé). N = 0 : teinte avertissement (ambre),
       icône triangle, libellé « 0 masqué ».
     - **Bouton « Envoyer »** (droite) : libellé fixe, jamais rallongé,
       style primaire + cadre blueprint.
5. **Journal** : masqué par défaut, réservé au débogage — pas un élément
   de l'usage normal.

**Redimensionnement** : seule la zone Historique grandit/rétrécit
(`flex:1`) ; tout le reste garde une taille fixe. Historique et Composer
ont chacun leur propre ascenseur interne si leur contenu dépasse ; un
ascenseur global n'apparaît que si l'ensemble du panneau dépasse la fenêtre
(comportement natif du navigateur, jamais géré manuellement).

**Cadre « blueprint »** : bordure fine + 4 marques d'angle `+` — jamais de
coins arrondis ni de fond plein (sauf le bouton primaire). Utilisé pour le
bandeau de site, les bulles d'historique et le bouton « Envoyer ».

## Macro-UC (vue d'ensemble)

Liste de haut niveau, à décliner ensuite en UC détaillés avec le template
ci-dessous. Chaque macro-UC deviendra un ou plusieurs UC-XXX.

| ID | Macro-UC | Résumé |
|----|----------|--------|
| M-01 | Gestion de la liste de sites autorisés | Configurer la whitelist des sites sur lesquels fogbank peut agir (grands sites IA pré-activés + ajout manuel), avec pour chaque site sa durée de vie (M-08), son format de pseudonyme (M-10) et son mode de réplication (M-16). Un nouveau site passe par un parcours de configuration guidé (M-15, UC-005) avant d'être considéré prêt |
| M-02 | Gestion de l'annuaire privé | Créer/modifier/supprimer les entités (personne, organisation, lieu, projet, divers) de l'annuaire, stocké localement dans le navigateur ([ADR-005](adr/0005-stockage-local.md)) ; une entité a un alias indépendant par site (voir [ARCHITECTURE.md](ARCHITECTURE.md)) et, pour une personne, un email facultatif |
| M-03 | Déclenchement du menu `&` | Ouvrir le menu de sélection à la frappe de `&` **dans le champ de composition du side panel** (voir [ADR-001](adr/0001-caractere-declencheur.md)) |
| M-04 | Ajout à la volée depuis `&` | Créer une nouvelle entité directement depuis le menu si elle n'existe pas encore dans l'annuaire, avec sélection manuelle obligatoire de son type ; **insère le vrai nom, en clair, dans le champ du panneau**, jamais le tag — le panneau est en clair, voir Vue d'ensemble |
| M-05 | Calque de décoration de la mention | Le champ de composition du panneau contient le vrai nom en clair ; une couche de décoration (shadow root fermé) le souligne et révèle, au survol, le tag `[TYP:ALIAS]` correspondant — entièrement dans le panneau, jamais dans le DOM du site |
| M-06 | Envoi sans réécriture | Vestigial, absorbé par M-16 : il n'y a pas de « geste d'envoi » distinct côté fogbank — c'est la réplication (M-16) qui reconstruit la version taguée et détermine ce qui se trouve dans le champ du site au moment où l'utilisateur clique sur son bouton d'envoi. Aucun garde-fou, aucune détection d'un vrai nom tapé en clair hors d'une mention suivie |
| M-07 | Restauration automatique à la réception | Lire tout le texte visible de la page (hors champs de saisie) et afficher, **dans le panneau**, sa version résolue — aucune substitution dans le DOM du site |
| M-08 | Durée de vie / rotation du pseudonyme | Générer un nouveau pseudonyme quand l'alias est utilisé après expiration de la durée configurée pour le site concerné (M-01) — rotation paresseuse à l'usage, pas de tâche périodique |
| M-09 | Historique des alias | Conserver la trace de tous les pseudonymes jamais attribués à chaque entité, **par site**, y compris expirés |
| M-10 | Génération du pseudonyme | Générer le pseudonyme `[TYP:ALIAS]` selon le format configuré **pour le site courant** (M-01, commun aux 4 types sur ce site) : reconnaissable (initiales, plusieurs variantes) ou opaque (aléatoire), avec suffixe numérique automatique en cas de collision |
| M-11 | Typage de l'entité | Faire choisir manuellement le type (PER/ORG/LOC/PRJ/MISC) à l'utilisateur lors de l'ajout, et le conserver en clair dans le tag du pseudonyme |
| M-12 | Conversion de fichiers générés | Interface dédiée (voir UC-006) pour pseudonymiser ou restaurer le contenu d'un fichier (.md, .csv, .txt...) dans les deux sens, en mode manuel (bouton, geste explicite) ou automatique (toggle par site, au téléchargement) ; le fichier proposé porte un infixe avant l'extension d'origine (`rapport.txt` → `rapport.fog.txt` ou `rapport.unfog.txt`) |
| M-13 | Export / import de l'annuaire (Excel) | Exporter l'annuaire et son historique vers un fichier `.xlsx` local, et importer un tel fichier pour peupler ou mettre à jour l'annuaire |
| M-14 | Mode « vision site » _(différé, non spécifié)_ | Bascule volontaire affichant les pseudonymes bruts tels que le site IA les voit réellement, sans restauration — voir TODO dans UC-002 |
| M-15 | Ciblage du champ d'écriture, persistant par site | Cibler un champ éditable du site par clic droit (« écrire ici »), mémoriser ce ciblage pour l'onglet courant et le persister par site pour un retrouvage automatique aux visites suivantes |
| M-16 | Réplication panneau → site | Répliquer le contenu du panneau vers le champ ciblé par écrasement total, en mode manuel ou automatique (par site), avec témoin de synchro, dégradation automatique et repli presse-papier |

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
| UC-001 | Mention `&` et insertion du tag `[TYP:ALIAS]` dans le panneau | implémenté |
| UC-002 | Restauration à la réception — affichage panneau | implémenté |
| UC-003 | Ciblage du champ d'écriture, persistant par site | implémenté |
| UC-004 | Réplication du panneau vers le champ ciblé | implémenté |
| UC-005 | Configuration d'un site (onboarding) | en cours d'implémentation |
| UC-006 | Conversion de fichiers (manuelle et automatique) | brouillon |

---

### UC-001 — Mention `&` et insertion du vrai nom dans le panneau

**Statut** : implémenté
**Macro-UC rattaché** : M-03, M-04 (sélection seulement), M-05, M-10
**Dépendances** : aucune

Code : `src/content/editor-handle/` (façade de saisie), `src/content/display.js`
(calque de décoration), `src/content/mention-menu.js` (insertion, suivi des
mentions par position), `src/sidepanel/` (orchestration, reconstruction de
la version taguée à la réplication — voir UC-004).

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
   `&filtre` par son **vrai nom, en clair**, inséré via
   `EditorHandle.replaceRange` — **jamais le tag**. Le panneau est en clair
   (voir Vue d'ensemble) : rien n'est risqué à y afficher le nom réel,
   contrairement à un champ qui partirait directement au site. Le tag
   `[TYP:ALIAS]` n'existe qu'au moment de la réplication (UC-004).
   - L'insertion est enregistrée comme une **mention suivie par position**
     (`{debut, fin, entite, alias}`, voir `mention-menu.js`) plutôt que
     redécouverte en reparcourant le texte : sans motif structurel comme
     `[TYP:ALIAS]` à rechercher, il n'y a pas d'autre moyen fiable de
     retrouver plus tard quel nom correspond à quelle entité.
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
4. Le calque de décoration (racine shadow DOM fermée), attaché au champ du
   panneau, souligne chaque mention suivie et affiche, au survol, une
   infobulle montrant le tag `[TYP:ALIAS]` qui sera envoyé au site — pas le
   nom réel, déjà visible sans avoir à survoler.

   Confirmation du menu par clavier : Entrée, Tab ou Espace, au choix.
5. Le panneau reste en clair jusqu'à la réplication (voir UC-004) : c'est
   à ce moment, et seulement à ce moment, que le texte du champ est
   transformé en remplaçant chaque mention suivie par son tag — cette
   version taguée est la seule à atteindre le champ ciblé du site. Il n'y a
   pas de « geste d'envoi » distinct côté fogbank au sens de l'ancien
   modèle fail-closed appliqué à un champ de site : c'est la réplication
   qui détermine le contenu du champ au moment où l'utilisateur clique sur
   le bouton d'envoi du site lui-même (hors du contrôle de fogbank, voir
   ADR-009).
6. **Pastille compteur** (voir § Ergonomie) : affiche le nombre d'entités
   **distinctes** actuellement mentionnées dans le composer (dédupliquées
   par entité, pas par occurrence — deux mentions de la même entité ne
   comptent que pour une). Cliquer dessus déroule la liste « nom réel —
   `[TYP:ALIAS]` » de ces entités, dans l'ordre de leur première mention.
   Recalculée à chaque frappe (mêmes événements que le suivi des mentions),
   fermée automatiquement si le composer est vidé.

**Données**
- Entrée : frappe clavier dans le panneau, texte tapé après `&`, position
  du curseur.
- Lecture : `fogbank.annuaire`, `fogbank.sites` (`chrome.storage.local`,
  voir [ADR-005](adr/0005-stockage-local.md)) ; site courant déterminé par
  l'URL de l'onglet actif (voir `shared/site-matching.js`).
- Écriture : nouvel alias / historique ajouté à l'entité concernée si
  généré à la création de la mention.
- Sortie : contenu du champ du panneau modifié directement (nom réel
  inséré via `EditorHandle`), plus une entrée ajoutée à la liste des
  mentions suivies (état en mémoire, pas persisté). Le calque de
  décoration est un rendu séparé dans la racine shadow DOM fermée, propre
  à la page du panneau ; il ne modifie jamais le contenu du champ.

**Cas d'erreur**
- Aucune entité ne correspond au texte tapé → menu vide. Pas de création à
  la volée dans cet UC (M-04/M-11, différé à un UC suivant).
- Aucun site actif ne correspond à l'onglet actif au moment de la frappe →
  la frappe et l'insertion du nom fonctionnent quand même (voir Résultat
  attendu, point 2) ; c'est la réplication (UC-004) qui échouera faute de
  cible, pas l'insertion elle-même.
- L'utilisateur tape alors que le curseur est **strictement à l'intérieur**
  d'une mention déjà insérée → la frappe est bloquée (voir Contraintes),
  pour ne jamais laisser le nom réel se corrompre partiellement.
  Backspace/Delete au bord ou à l'intérieur suppriment la mention entière
  d'un coup (suppression atomique).
- Une édition qui chevauche malgré tout une mention (ex : sélection
  multi-caractères couvrant en partie le nom, collage) → la mention est
  abandonnée du suivi : son soulignement disparaît, c'est le seul signal.
  Le texte qui en résulte, non reconnu comme mention, part **en clair, tel
  quel**, à la réplication — voir Contraintes, angle mort assumé.
- L'utilisateur tape un vrai nom déclaré dans l'annuaire directement en
  clair dans le panneau, sans passer par `&` → **non détecté, non
  signalé**, jamais suivi comme mention. Le nom part tel quel à la
  réplication. Limite assumée, voir Contraintes.

**Contraintes**
- Façade `EditorHandle` toujours utilisée pour le champ du panneau, même si
  celui-ci est un `<textarea>` unique et connu à l'avance — garde le code
  de `mention-menu.js` et `display.js` identique à ce qu'il est pour tout
  autre usage, aucune divergence à maintenir.
- Suivi des mentions par position (préfixe/suffixe commun entre le texte
  avant/après chaque frappe, voir `mention-menu.js#trouverPlageEditee`) :
  plus robuste qu'une déduction depuis la seule touche appuyée (fonctionne
  aussi pour un collage, une composition IME, une correction automatique),
  mais reste approximatif — une édition qui chevauche une mention
  l'abandonne plutôt que de risquer une reconstruction erronée (voir Cas
  d'erreur).
- Suppression atomique + blocage de frappe à l'intérieur d'une mention :
  seules protections structurelles contre la corruption — pas de détection
  a posteriori d'un nom altéré (le texte résultant, non suivi, part en
  clair sans avertissement autre que l'absence de soulignement).
- **Aucun garde-fou, aucune détection de vrai nom tapé en clair** en dehors
  d'une mention suivie : fogbank ne protège que ce qui passe effectivement
  par le menu `&`. Limite à documenter clairement dans le README
  utilisateur.
- Calque de décoration : racine shadow DOM **fermée**, hôte anodin, aucune
  ressource externe, `pointer-events: none`, propriétés de peinture
  uniquement sur le soulignement — partagé avec UC-002 dans
  [ARCHITECTURE.md](ARCHITECTURE.md).
- Rotation paresseuse (M-08) : l'expiration d'un alias est vérifiée **à
  chaque insertion d'une mention pour une entité donnée** (étape 2
  ci-dessus), vis-à-vis du site actuellement ciblé (UC-003) ou, à défaut,
  du site correspondant à l'onglet actif.
- À tester contre
  [tests/fixtures/mock-ai-site/index.html](../tests/fixtures/mock-ai-site/index.html)
  comme destination de réplication (voir UC-004), avec l'annuaire de
  [tests/fixtures/annuaire-exemple.json](../tests/fixtures/annuaire-exemple.json)
  chargé dans `chrome.storage.local`.

---

### UC-002 — Restauration à la réception — affichage panneau

**Statut** : implémenté
**Macro-UC rattaché** : M-07
**Dépendances** : M-04 (le tag `[TYP:ALIAS]` est ce qui part réellement au
site IA depuis la réplication — voir UC-001, UC-004), M-10 (génération du
code)

**Déclencheur**
L'utilisateur a répliqué (UC-004) un prompt contenant un ou plusieurs tags
`[TYP:ALIAS]` vers le site IA, qui affiche sa réponse quelque part dans la
page — fogbank ne cherche pas à savoir où. La réponse peut contenir zéro,
un ou plusieurs tags de la forme `[TYP:ALIAS]`.

**Résultat attendu**

Mécanisme **DOM uniquement**, un seul `MutationObserver` sur
`document.body` (content script, `content/ecriture.js`) pour toute la
page — le même pour tout site, pas de hook réseau.

- Chaque mutation reporte un minuteur de ~500 ms : tant que la page bouge,
  rien ne se passe. Un premier passage est aussi planifié
  inconditionnellement au chargement (couvre une conversation déjà rendue,
  sans aucune mutation à observer).
- Une fois la page stable, le content script extrait **deux choses en
  parallèle** et les envoie au panneau (message `fogbank:page-stable`) :
  1. Tout le texte visible de `document.body`, **hors champs de saisie**
     (`[contenteditable="true"], textarea` — jamais touchés) — le bloc
     unique, calculé **systématiquement**, quel que soit le site (repli
     garanti, voir point 3).
  2. Les **tours de conversation**, si un profil de lecture (voir
     [ADR-011](adr/0011-lecture-par-tour.md),
     `content/profils-lecture.js`) correspond au site **et** trouve au
     moins un élément : un tableau `{index, role, texte}` ordonné, `role`
     valant `utilisateur` ou `assistant`. `null` sinon (site sans profil,
     ou profil dont le sélecteur ne trouve plus rien).
- Le panneau résout chaque tag `[TYP:ALIAS]` complet trouvé via l'annuaire
  (même regex/logique que `pseudonyme.js`), tour par tour si disponibles,
  sinon sur le bloc unique — remplacement textuel simple
  (`String.replace`), pas de DOM à construire côté site puisque rien n'y
  est écrit.
- **Affichage** : une bulle par tour (bordure colorée par rôle, actions
  copier/localiser propres à la bulle — voir § Ergonomie) si des tours ont
  été trouvés ; sinon le bloc de texte unique avec ses actions globales
  (comportement historique, avant [ADR-011](adr/0011-lecture-par-tour.md)).
  Jamais d'échec entre les deux : au pire, dégradation vers le bloc
  unique.
- Un rafraîchissement manuel (bouton dans le panneau) reste possible pour
  forcer une relecture immédiate sans attendre la stabilisation.

Scanner toute la page dès qu'elle cesse de bouger (plutôt qu'un hook
réseau) est le mécanisme retenu pour rester robuste face à des sites dont
la structure n'est pas maîtrisée — ce principe ne change pas. Ce qui change
avec ADR-011, c'est l'ajout d'une identification **best-effort** des tours
par-dessus ce même scan, sans jamais rien écrire dans le DOM du site : le
risque d'un sélecteur pour la lecture n'est pas comparable à celui d'un
sélecteur pour l'écriture (voir ADR-011, Contexte) — il dégrade, il ne
casse jamais rien côté site.

**Données**

Entrée :
- Tout le texte rendu de la page (`document.body`), hors champs de saisie.
- Les tours de conversation, si un profil de lecture correspond au site
  (voir `content/profils-lecture.js`) — `null` sinon.
- Annuaire `fogbank.annuaire[]` en lecture (côté panneau) pour la
  résolution `type + ALIAS → { nomReel, siteId d'origine }`.

Sortie :
- Zone d'affichage en lecture seule dans le panneau (bulles ou bloc
  unique), texte résolu. Aucune écriture vers le site IA, ni dans son DOM
  ni dans son transport : la page du site n'est jamais modifiée par cet
  UC, y compris quand un profil de lecture est utilisé (lecture seule,
  jamais de ciblage ni d'écrasement — voir ADR-011).

Non-écriture en storage :
- La restauration ne modifie ni `fogbank.annuaire[]` ni `fogbank.sites[]`.
  Elle est purement présentation.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Tag `[TYP:ALIAS]` reçu mais aucune entité correspondante dans l'annuaire (ex : annuaire modifié entre l'envoi et la réception, ou tag halluciné par le modèle) | Le tag reste affiché brut dans le texte résolu. Pas d'erreur bloquante. |
| Type valide mais CODE inconnu pour ce type | Idem : traité comme un pseudonyme inconnu, aucun remplacement. |
| Tag mal formé (ex : `[per:PDT]` en minuscule, `[PER:PD T]` avec espace) | Non détecté par la regex, laissé brut. Comportement attendu, pas de tentative de correction. |
| La page ne cesse jamais de bouger (animation continue, polling du site) | Le minuteur de stabilité ne se déclenche jamais ; le rafraîchissement manuel reste disponible en repli. |
| Texte extrait trop bruyant (navigation, barre latérale, contenu hors conversation) | En mode bloc unique (pas de profil de lecture) : non filtré, le panneau affiche tout, y compris du texte non pertinent. En mode bulles, chaque bulle ne contient que le texte de son tour — ce bruit ne se pose plus, sous réserve que le sélecteur du profil cible bien l'élément de message. |
| Réponse ne contenant aucun tag | Le texte affiché dans le panneau est identique au texte brut de la page ; aucune erreur. |
| Aucun profil de lecture pour le site, ou profil dont le sélecteur ne trouve aucun élément (structure du site changée) | `obtenirTours()` renvoie `null` ; repli automatique sur le bloc unique, sans erreur visible pour l'utilisateur. |
| Action « localiser » sur une bulle dont l'élément d'origine a disparu du DOM entre la lecture et le clic (nouveau message, re-render) | `fogbank:localiser-tour` re-requête le sélecteur au moment du clic ; si l'index ne correspond plus au bon tour (décalage), le scroll peut cibler un autre message. Limite assumée du best-effort — voir Contraintes. |

**Contraintes**

- **Pas de hook réseau** pour M-07 : la lecture se fait par scan de page
  (`MutationObserver`), pas par interception du trafic réseau.
- **Le bloc unique reste calculé systématiquement**, même quand un profil
  de lecture trouve des tours : c'est le repli garanti, jamais une valeur
  qui pourrait manquer. Le scan `document.body` entier (sans délimiter de
  zone propre au site) reste donc le mécanisme de base ; les profils de
  lecture (voir [ADR-011](adr/0011-lecture-par-tour.md)) s'y ajoutent,
  sans le remplacer.
- **Aucun profil de lecture n'est utilisé pour cibler ou écrire** : le
  ciblage (UC-003) et l'écrasement (UC-004) restent entièrement
  génériques, sans sélecteur par site — voir ADR-011, qui distingue
  explicitement ce cas du contrat d'adaptateur abandonné par ADR-008.
- L'index d'un tour (`{index, ...}`) n'est valable que jusqu'au prochain
  changement de structure de la page : `fogbank:localiser-tour` re-requête
  le sélecteur du profil au moment du clic plutôt que de garder une
  référence DOM vivante (qui deviendrait invalide après un rechargement ou
  un re-render complet) — voir Cas d'erreur.
- Un tag est considéré complet quand la regex
  `\[(PER|ORG|LOC|PRJ|MISC):[A-Z0-9-]+\]` matche entièrement dans le texte
  extrait.
- Exclusion explicite des champs de saisie actifs lors de l'extraction —
  sans elle, le tag encore visible dans un champ en cours de composition
  serait lui-même résolu et affiché, ce qui n'a pas de sens (il n'a pas
  encore été envoyé).
- Cohérence visuelle : le style utilisé pour un pseudonyme inconnu (s'il en
  reste un affiché tel quel) reste cohérent avec M-05, mais l'affichage
  étant un simple bloc de texte dans le panneau (pas du DOM substitué avec
  `<span>` individuels), il n'y a pas d'infobulle inversée par tag — voir
  Points ouverts.

Performance :
- Un passage complet sur tous les nœuds texte de `document.body` à chaque
  stabilisation : accepté comme suffisamment léger même sur une
  conversation longue, à confirmer empiriquement si une page réelle
  s'avère plus volumineuse que prévu.

Implémentation :
- `content/ecriture.js` pose l'unique `MutationObserver`, extrait le bloc
  unique et, via `content/profils-lecture.js` (voir ADR-011), les tours du
  site s'il en existe un profil ; diffuse `fogbank:page-stable` ;
  `sidepanel/sidepanel.js` résout et affiche (bulles ou bloc unique).

**Points ouverts**

- **Bruit du texte extrait en mode bloc unique** : voir Cas d'erreur — pas
  bloquant (et déjà résolu en mode bulles, quand un profil de lecture
  s'applique), mais un filtrage du bloc unique reste envisageable pour les
  sites sans profil, si l'usage réel s'avère gênant.
- **Doublon de libellé d'accessibilité** (voir ADR-011, Contexte) : un
  extrait réel de Claude.ai montre un texte dupliqué (« Vous avez dit :
  X... X », probablement un libellé d'accessibilité suivi du texte visible
  qu'il annonce), visible en mode bloc unique. Les sélecteurs de profil
  ciblent directement l'élément de message, ce qui devrait éviter ce bruit
  en mode bulles — **à confirmer contre le vrai site**, pas seulement
  contre les fixtures locales (voir ADR-011, Conséquences).
- **Infobulle par tag** : en mode bloc unique toujours (bloc de texte
  simple, pas de `<span>` par tag) ; en mode bulles, chaque bulle affiche
  déjà le texte résolu d'un seul tour, mais sans infobulle par nom restauré
  — à réintroduire si jugé utile.
- **Historique de conversation / SPA** : un rechargement réel (F5) comme un
  changement de conversation en SPA (`pushState`) sont couverts par le même
  mécanisme, sans traitement spécial (le passage de stabilisation planifié
  au chargement couvre une conversation déjà rendue ; le `MutationObserver`
  capte tout changement de contenu quel que soit le conteneur concerné). En
  mode bulles, un changement de conversation republie une liste de tours
  entièrement nouvelle à la stabilisation suivante — pas de fusion avec la
  précédente.
- **Périmètre des profils de lecture** : seuls ChatGPT, Claude.ai et
  Copilot grand public ont un profil (voir ADR-011) ; tout autre site reste
  en mode bloc unique, sans régression par rapport au comportement
  antérieur à ADR-011.

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
- Style spécifique en mode vision : les tags `[TYP:ALIAS]` doivent-ils être
  eux-mêmes stylisés (ex : fond gris pâle façon `<code>`) pour souligner
  qu'on regarde du contenu système ?
- Raccourci clavier : à définir (proposition : `Alt+Maj+F` ou touche
  maintenue pour peek temporaire).

---

### UC-003 — Ciblage du champ d'écriture, persistant par site

**Statut** : implémenté
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
  geste exigé par l'API.

---

### UC-004 — Réplication du panneau vers le champ ciblé

**Statut** : implémenté
**Macro-UC rattaché** : M-16
**Dépendances** : UC-001 (contenu à répliquer), UC-003 (champ ciblé)

**Déclencheur**
Mode manuel : l'utilisateur clique sur « Envoyer » dans le panneau. Mode
auto (`fogbank.sites[].modeReplication === "auto"`) : la frappe s'arrête
dans le champ du panneau pendant ~300-400 ms.

**Résultat attendu**
1. Le panneau reconstruit, à partir du texte en clair du champ de
   composition et de la liste des mentions suivies (voir UC-001), la
   version où chaque nom réel est remplacé par son tag `[TYP:ALIAS]` — c'est
   cette version taguée, jamais le texte en clair, qui est envoyée au
   content script de l'onglet ciblé (message `fogbank:ecrire`).
2. Le content script sélectionne tout le contenu existant du champ ciblé
   puis le remplace via `document.execCommand('insertText', false, texte)`
   — écrasement total, jamais une insertion au curseur (voir ADR-008).
3. **Vérification a posteriori** : le contenu du champ après écriture est
   relu et comparé au texte attendu. Une discordance (le site a réécrit
   par-dessus, ou l'a partiellement ignoré) est traitée comme un échec,
   même si `execCommand` a retourné succès — c'est la seule preuve fiable
   qu'un site a réellement accepté l'écriture (voir ADR-008).
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
   copie la même version taguée (reconstruite comme au point 1), jamais le
   texte en clair du panneau : coller ce repli dans le site ne doit pas
   pouvoir envoyer un nom réel. `navigator.clipboard.writeText` depuis le
   panneau, aucune dépendance au ciblage ou à l'état du site.

**Données**
- Entrée : texte en clair du champ de composition du panneau et liste des
  mentions suivies (voir UC-001) ; référence en mémoire du champ ciblé
  (voir UC-003).
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
| Écrasements rapprochés (mode auto, frappe continue avec anti-rebond court) | Attendu accepté sans échec par un site normal. Si un site s'avère n'accepter que le premier d'une rafale, dégradation automatique après 1-2 échecs (point 5) limite les dégâts. |
| Modification externe détectée pendant le mode auto | Synchronisation suspendue, message affiché (voir Résultat attendu, point 6) ; reprise sur action explicite de l'utilisateur (pas de reprise automatique silencieuse — recréerait le même risque). |
| L'utilisateur clique sur le bouton d'envoi du site alors que le témoin affiche *échec* ou *en attente* | Fogbank ne bloque pas ce clic (pas de contrôle sur le bouton du site, voir ADR-009) — le témoin est le seul avertissement. Limite assumée, à documenter. |
| `navigator.clipboard.writeText` échoue (permission refusée, contexte non sécurisé) | Message d'échec dans le panneau ; pas de repli supplémentaire — c'est déjà le repli de dernier recours. |

**Contraintes**
- Écrasement total uniquement — jamais une tentative d'insertion au
  curseur dans le champ du site.
- Anti-rebond (~300-400 ms) obligatoire en mode auto : une écriture par
  caractère tapé déclencherait un cycle de rendu du site à chaque frappe,
  en plus d'être inutile (voir ADR-009).
- La dégradation automatique et la suspension sur modification externe ne
  sont **jamais silencieuses** : chacune doit produire un message visible
  dans le panneau — c'est le principe fail-closed transposé à la
  réplication (voir ADR-009).
- Aucun contrôle du bouton d'envoi du site : fogbank n'intercepte ni
  `Enter` ni le clic sur le bouton d'envoi natif — le contenu du champ est
  déjà correct au moment de l'écrasement, ce n'est donc pas nécessaire ;
  c'en est aussi la limite (voir Cas d'erreur, avant-dernière ligne).
- `chrome.storage.onChanged` sur `fogbank.sites` doit garder le panneau à
  jour si le mode de réplication est changé depuis l'onglet Sites de
  `options/` pendant que le panneau est ouvert.

---

### UC-005 — Configuration d'un site (onboarding)

**Statut** : en cours d'implémentation
**Macro-UC rattaché** : M-01, M-15
**Dépendances** : UC-003 (ciblage), UC-004 (réplication, réutilisée pour le
test d'écriture), UC-002 (lecture de page, réutilisée pour la vérification)

Réunit M-01 (whitelist) et M-15 (ciblage, UC-003) en un seul parcours
guidé, avec deux points d'entrée équivalents. Contrairement à
UC-001/UC-003/UC-004, ce parcours ne s'exécute qu'une fois par site (tant
que `configurationTerminee` reste `true`) — ce n'est pas un mécanisme
déclenché à chaque usage.

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
   visuellement que ce texte apparaît bien sur la page du site. Ce succès
   confirme du même coup le descripteur du champ ciblé à l'étape 1 (« la
   balise », voir UC-003) : c'est à ce moment qu'il est (re)enregistré dans
   `fogbank.sites[].cibleEcriture` — la fiche de préférences du site —
   plutôt que de rester une correspondance non vérifiée.
3. **Test d'envoi** : un bouton écrit, par le même mécanisme, un message
   invitant explicitement l'IA à répondre par une phrase fixe portant un
   tag fogbank réel et **résolvable** (« Ceci est un test, merci de
   répondre par « test bien reçu [LOC:PA0001] ». ») : `[LOC:PA0001]`
   résout vers l'entité **« Paris, France »**, une entité par défaut
   (voir Données) plutôt qu'un tag arbitraire non résolvable — le test
   valide ainsi la résolution réelle (M-10), pas seulement la présence
   d'une sous-chaîne. L'utilisateur envoie lui-même ce message depuis le
   site (fogbank ne contrôle pas son bouton d'envoi, voir ADR-009). Un
   bouton « Vérifier la réponse » relit ensuite la page
   (même mécanisme que UC-002, `fogbank:lire-clair`) et cherche la
   sous-chaîne « test bien reçu [LOC:PA0001] » dans le texte extrait —
   **deux occurrences attendues**, pas une seule :
   - la **première** correspond au message de l'utilisateur lui-même (il
     contient la phrase complète, donc aussi cette sous-chaîne) —
     identifie où, dans l'historique de la conversation affiché par le
     site, se trouve le tour de l'utilisateur ;
   - la **seconde** correspond à la réponse de l'IA — identifie où se
     trouve le tour de l'assistant.

   Trouver les deux valide **à la fois** que l'écriture est bien passée
   jusqu'à l'IA et que la lecture de page fonctionne sur ce site, dans le
   même geste ; le panneau affiche alors, sous ce test, le dialogue
   identifié (contexte autour de chaque occurrence) pour que l'utilisateur
   confirme visuellement que c'est bien son message et la bonne réponse
   qui ont été reconnus — pas une coïncidence de texte ailleurs sur la
   page.

   > Ce point précis de l'implémentation demande davantage de réflexion
   > que le reste de cet UC : distinguer de façon fiable « première
   > occurrence = utilisateur, seconde = assistant » suppose de
   > comprendre comment chaque site restitue l'historique dans le texte
   > extrait (ordre chronologique fiable ou non, doublons possibles côté
   > brouillon/streaming, etc.) — à valider contre les sites réels avant
   > de considérer ce mécanisme acquis, pas seulement contre les fixtures.
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
  (`creeLe`: date du jour, `dureeViePseudonyme: "1a"`,
  `formatPseudonyme: "court"`, `modeReplication: "manuel"`,
  `cibleEcriture: null`, `configurationTerminee: false`).
- Puis, au fil du parcours : `cibleEcriture` (étape 1, via UC-003),
  `dureeViePseudonyme`/`formatPseudonyme` (étape 4), `configurationTerminee`
  (étape 5).

Écriture dans `fogbank.annuaire[]` — entité par défaut « Paris, France » :
- **« Paris, France »** (type `LOC`, code fixe `PA0001`, pas généré par
  M-10) est une entité par défaut de l'annuaire, présente dès
  l'installation au même titre que les sites pré-activés (voir ADR-004).
  Contrairement aux entités ordinaires, son code n'est pas dérivé de son
  nom ni généré à l'insertion d'un tag — il est fixe, pour que le message
  de test de l'étape 3 soit prévisible et identique sur tous les sites.
- À la création d'un nouveau site (points d'entrée 1 et 2 de cet UC), un
  `aliasParSite` pour cette entité est ajouté automatiquement si absent,
  avec `aliasActif: "PA0001"` et **`expireLe` égal à `creeLe` du site**
  (pas une expiration future calculée normalement, voir M-08) : cet alias
  n'est jamais le résultat d'un usage réel, il est prévu pour paraître
  déjà expiré dès la création du site. Une future mention réelle de
  « Paris » sur ce site (menu `&`, hors contexte de cet UC) déclenchera
  alors la rotation paresseuse habituelle (M-08) dès la première
  utilisation, plutôt que de rester indéfiniment sur ce code de
  bootstrap.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Clic droit sur un site dont le domaine correspond déjà à une entrée existante | L'entrée existante est réutilisée (correspondance par domaine) ; aucun doublon créé. |
| Test d'écriture : le texte n'apparaît pas sur la page | Aucun blocage technique — l'utilisateur reste sur cette étape, peut vérifier le ciblage (UC-003) ou réessayer. |
| Test d'envoi : sous-chaîne absente (zéro occurrence) | Message d'échec, pas de blocage — l'IA n'a peut-être pas encore répondu (page pas encore stabilisée, voir UC-002) ; l'utilisateur peut réessayer la vérification ou passer à l'étape suivante s'il a constaté le succès de visu. |
| Test d'envoi : une seule occurrence trouvée (pas deux) | Traité comme non concluant, pas comme un échec dur : soit la réponse de l'IA n'est pas encore visible, soit le site ne restitue pas le message utilisateur dans le même texte extrait. Le dialogue ne s'affiche pas ; message invitant à réessayer. |
| Test d'envoi : plus de deux occurrences trouvées (l'IA a répété la phrase, ou une régénération a eu lieu) | Prendre la première comme message utilisateur et la **dernière** comme réponse la plus récente, plutôt que la seconde — évite de pointer vers une réponse périmée après une régénération. |
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
  site (avec son historique) — sans laisser de référence orpheline
  affichée par son seul identifiant technique. Action irréversible,
  confirmée explicitement avant exécution.

---

### UC-006 — Conversion de fichiers (manuelle et automatique)

**Statut** : brouillon — mode manuel implémenté, mode automatique non
implémenté (voir Points ouverts)
**Macro-UC rattaché** : M-12
**Dépendances** : M-10 (génération/résolution d'alias, même annuaire que le
composer)

Complète le flux automatique (`&` → réplication → réponse affichée) : un
fichier généré par l'IA et téléchargé (`.md`, `.txt`...) peut contenir des
pseudonymes que le panneau ne restaure pas automatiquement (portée hors de
ce qu'il lit sur la page, voir UC-002). Vit dans le bloc « Conversion
fichier », imbriqué dans la zone Historique (voir § Ergonomie).

**Déclencheur**
- **Manuel** : l'utilisateur clique sur « Convertir un fichier… » (visible
  seulement quand `conversionFichierMode !== 'auto'` pour le site actif) et
  choisit un fichier local via un sélecteur natif.
- **Automatique** _(non implémenté, voir Points ouverts)_ : bascule du
  toggle « Conversion automatique au téléchargement » à actif pour le site
  courant ; en théorie, chaque fichier téléchargé depuis ce site serait
  alors converti sans confirmation.

**Résultat attendu**
1. Mode manuel : le fichier choisi est lu en local (`FileReader`, jamais
   uploadé), son contenu textuel est passé dans un sens ou l'autre :
   - **Pseudonymiser** : chaque nom réel de l'annuaire trouvé tel quel dans
     le texte est remplacé par son alias actif **pour le site courant**
     (même génération/rotation qu'une mention `&`, voir M-10) sous forme de
     tag `[TYP:ALIAS]`.
   - **Restaurer** : chaque tag `[TYP:ALIAS]` trouvé est résolu vers le nom
     réel de l'entité correspondante (même mécanisme que UC-002), tous
     sites confondus (unicité globale du code, voir Vue d'ensemble).
   Le sens (pseudonymiser/restaurer) est choisi explicitement par
   l'utilisateur avant conversion — pas de détection automatique du sens à
   partir du contenu.
2. Le résultat est proposé en téléchargement, avec un infixe avant
   l'extension d'origine (`rapport.txt` → `rapport.fog.txt` en
   pseudonymisation, `rapport.unfog.txt` en restauration) — jamais en
   écrasant le fichier d'origine.
3. Le toggle « Conversion automatique » est persisté par site
   (`fogbank.sites[].conversionFichierMode`, `'manuel' | 'auto'`) même si
   le mode `'auto'` n'a pas encore d'effet réel (voir Points ouverts) — le
   réglage est prêt à être branché sans migration de données
   supplémentaire.

**Données**
- Entrée : fichier local choisi par l'utilisateur (mode manuel), texte lu
  en mémoire — jamais envoyé à un tiers.
- Lecture : `fogbank.annuaire[]` (résolution/génération d'alias, même
  annuaire que le composer), `fogbank.sites[].conversionFichierMode`.
- Écriture : si conversion en sens « pseudonymiser » et qu'une entité
  mentionnée n'a pas encore d'alias pour le site courant, un nouvel alias
  est généré et persisté (même effet de bord que M-10 pour une mention
  `&`).
- Sortie : fichier téléchargé localement (infixe `.fog`/`.unfog`), aucune
  écriture réseau.

**Cas d'erreur**

| Cas | Comportement attendu |
|-----|----------------------|
| Fichier binaire ou encodage non textuel | Lecture échoue ou produit un texte inexploitable ; message d'erreur, pas de tentative de conversion partielle. |
| Aucun nom réel / tag trouvé dans le fichier (sens choisi ne correspond à rien) | Fichier de sortie identique à l'entrée ; pas une erreur, juste un résultat sans effet. |
| Tag `[TYP:ALIAS]` présent mais entité inconnue de l'annuaire (voir UC-002) | Laissé brut dans le résultat, comme en restauration de page. |
| Fichier trop volumineux pour un traitement synchrone en mémoire | Non traité dans cette itération — portée limitée aux formats texte simples (voir § Hors périmètre). |

**Contraintes**
- Formats texte simples uniquement (`.md`, `.txt`, `.html`) — pas de
  documents Office structurés (voir § Hors périmètre, version open
  source).
- Traitement entièrement local (`FileReader` + génération d'un `Blob` à
  télécharger) : aucun contenu de fichier ne transite par un appel réseau.
- Même logique d'unicité globale des alias que M-10/M-12 : la restauration
  ne dépend pas de connaître le site d'origine du fichier.

**Points ouverts**

- **Mode automatique non implémenté** : le toggle est persisté (voir
  Données) mais n'intercepte encore aucun téléchargement. Nécessiterait
  `chrome.downloads.onDeterminingFilename` (ou équivalent) et une
  permission additionnelle (`downloads`) non demandée dans cette itération
  — à spécifier dans un UC de suivi avant implémentation, plutôt que de
  deviner son comportement ici.
- **Détection du sens (pseudonymiser vs restaurer)** : actuellement un
  choix explicite de l'utilisateur à chaque conversion manuelle ; une
  détection automatique (présence de tags `[TYP:ALIAS]` vs noms réels
  connus) est envisageable mais pas retenue pour cette itération, pour
  éviter une conversion dans le mauvais sens sur un texte ambigu.
