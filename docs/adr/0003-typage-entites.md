# ADR-003 — Typage des entités et format du tag de pseudonyme

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

L'extension ne pseudonymise pas uniquement des personnes : cinq types
d'entités sont pris en charge (voir [SPECS.md](../SPECS.md), M-02, M-11) :
**personne**, **organisation**, **lieu**, **projet**, **divers**.

Contrainte forte : l'IA destinataire doit pouvoir **reconnaître la nature de
l'objet substitué** (comprendre qu'il s'agit d'une personne, d'une
organisation, d'un lieu, d'un projet ou d'une autre entité), même si elle
ne connaît pas l'identité réelle derrière le pseudonyme. Sans cette
information, la qualité des réponses de l'IA se dégraderait (elle ne peut
pas raisonner correctement sur "PDT" si elle ne sait pas si c'est une
personne ou un projet).

Il faut donc un format de pseudonyme qui encode explicitement le type, en
plus du code d'identification (voir [ADR-002](0002-format-pseudonyme.md)
pour la génération du code lui-même).

## Options considérées (format du tag de type)

| Format | Exemple | Remarque |
|--------|---------|----------|
| Préfixe mot-clé explicite | `Personne_PDT` | Lisible mais alourdit le texte du prompt, ambiguïté possible avec du texte normal |
| Préfixe court/code | `P-PDT` | Compact, mais un code à une lettre est ambigu (`P` = Personne ou Projet ?) |
| Tag entre crochets | `[Personne:PDT]` | Explicite, syntaxe clairement délimitée et non ambiguë, facile à détecter/parser côté extension (regex simple) |

## Décision

1. **Format retenu : tag entre crochets avec trigramme** — `[TYP:CODE]`,
   `TYP` étant un trigramme fixe par type, aligné sur le schéma NER standard
   (CoNLL-2003 : `PER`/`ORG`/`LOC`/`MISC`) plutôt qu'inventé — familier pour
   quiconque a déjà croisé de l'extraction d'entités, et `MISC` fournit un
   type fourre-tout qui manquait :
   - `PER` — personne (ex: `[PER:PDT]`)
   - `ORG` — organisation (ex: `[ORG:ACM]`)
   - `LOC` — lieu (ex: `[LOC:PRS]`)
   - `PRJ` — projet (ex: `[PRJ:FGB]`) — hors schéma NER standard, conservé
     car spécifique au besoin de fogbank (un projet n'est ni une personne,
     ni une organisation, ni un lieu, et mérite mieux qu'un classement en
     divers)
   - `MISC` — divers (ex: `[MISC:XYZ]`) — catégorie fourre-tout pour toute
     entité sensible qui ne rentre dans aucun des quatre autres types

   Le trigramme lève l'ambiguïté du préfixe court à une lettre (`P` seul
   aurait été ambigu entre Personne et Projet) tout en restant compact,
   contrairement au mot-clé complet. Seul `MISC` fait quatre caractères
   (pas un vrai trigramme) : c'est le code du schéma NER standard, on ne
   l'a pas raccourci pour ne pas s'en écarter inutilement.
2. **Détermination du type : choix manuel obligatoire.** Lors de l'ajout
   d'une nouvelle entité via le menu `&` (M-04), l'utilisateur sélectionne
   explicitement le type parmi les cinq. Aucune détection automatique
   n'est effectuée : plus fiable, et évite les erreurs de classification
   qui exposeraient indirectement la nature réelle d'une donnée mal typée.
3. **Génération du CODE : schéma générique commun** aux cinq types (voir
   [ADR-002](0002-format-pseudonyme.md)) — même logique d'initiales ou de
   génération opaque quel que soit le type ; seul le préfixe de type dans
   le tag change. Pas de schéma dédié par type pour l'instant.

## Conséquences

- Le tag `[TYP:CODE]` doit être détectable de façon fiable par une
  expression régulière simple, aussi bien au moment de la substitution
  (M-06) que de la restauration (M-07).
- Point ouvert pour la spec détaillée (UC-by-UC) : le schéma générique
  d'initiales (ADR-002) suppose un nom en au moins deux mots (prénom/nom).
  Pour des entités à un seul mot (ex: projet "Fogbank", lieu "Paris"), une
  règle de repli devra être définie à l'étape UC (ex: 2 premières + 2
  dernières lettres du mot unique).
- Le choix manuel du type ajoute une étape dans le flux d'ajout via `&`
  (M-04) : l'ergonomie de cette étape (liste déroulante, raccourcis
  clavier...) est à préciser dans l'UC détaillé correspondant.
