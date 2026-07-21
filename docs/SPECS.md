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

_Statut : brouillon à valider avant de passer à l'architecture cible._

## Modèle de cas d'usage (template)

Copier ce squelette pour chaque nouveau cas d'usage.

---

### UC-XXX — Titre du cas d'usage

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
| UC-001 | Mention `&` et pseudonymisation à l'envoi (contenteditable) | en cours |

---

### UC-001 — Mention `&` et pseudonymisation à l'envoi (contenteditable)

**Déclencheur**
L'utilisateur tape le caractère `&` dans un champ `contenteditable` d'un
site autorisé, suivi de texte de filtre.

**Résultat attendu**
1. Un menu de sélection s'ouvre sous le curseur, listant les entités de
   `fogbank.annuaire` dont le nom réel correspond au texte tapé après `&`
   (filtrage insensible à la casse, sous-chaîne).
2. La sélection d'une entité (clic ou Entrée) remplace le texte `&filtre`
   par une mention marquée : span non éditable, soulignement bleu, nom réel
   affiché en clair, `title` (infobulle native) montrant le pseudonyme
   `[TYP:CODE]` qui sera envoyé.
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
