# ADR-002 — Format de génération du pseudonyme

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

Chaque personne pseudonymisée (voir [SPECS.md](../SPECS.md), M-02, M-10) a
besoin d'un pseudonyme généré automatiquement à partir de son nom. Deux
besoins contradictoires se posent :

- Un pseudonyme **reconnaissable** aide l'utilisateur à s'y retrouver dans
  ses propres prompts sans avoir à consulter l'annuaire à chaque fois.
- Un pseudonyme **opaque** offre une meilleure discrétion quand la
  reconnaissabilité elle-même est un risque (ex: un pseudonyme trop évident
  reste devinable par un tiers qui lirait le prompt).

Les deux besoins sont légitimes selon le contexte d'usage (site, sensibilité
des données) : le format doit donc être configurable plutôt qu'imposé.

## Options considérées (format reconnaissable)

| Format | Exemple (Pierre Dupont) | Remarque |
|--------|--------------------------|----------|
| Initiale prénom + initiale nom + dernière lettre du nom | `PDT` | Compact, mais collisions plus fréquentes |
| Initiale prénom + 2 lettres du nom | `PDU` | Non retenu |
| 2 lettres prénom + 2 lettres nom | `PIDU` | Plus long, collisions moins fréquentes |
| Initiales + code numérique | `PD-07` | Non retenu (redondant avec la gestion de collision globale, voir plus bas) |

## Décision

1. **Deux formats reconnaissables retenus**, proposés comme options au choix
   de l'utilisateur (pas un seul format imposé) :
   - Format court : initiale prénom + initiale nom + dernière lettre du nom
     (ex: `PDT`)
   - Format étendu : 2 premières lettres du prénom + 2 premières lettres du
     nom (ex: `PIDU`)
2. **Un format opaque** (pseudonyme aléatoire sans lien visuel avec le nom,
   ex: `X7K2Q`) coexiste comme deuxième option configurable, indépendamment
   des formats reconnaissables.
3. Le format (court/étendu/opaque) est un attribut du **site**
   (`fogbank.sites[].formatPseudonyme`, voir [ARCHITECTURE.md](../ARCHITECTURE.md)
   et M-01), pas de l'entité : toutes les entités mentionnées sur un même
   site partagent le même style de pseudonyme, au même titre que sa durée
   de vie (M-08). Une même entité peut donc avoir des styles différents
   selon le site (ex: alias court sur un site, étendu sur un autre) — ce
   n'est pas une caractéristique intrinsèque de l'entité elle-même.
4. **Gestion des collisions, globale par type — pas par site** : si deux
   entités différentes du même type génèrent le même code reconnaissable
   (ex: Pierre Dupont et Paul Dumont → `PDT` tous les deux), un suffixe
   numérique est ajouté automatiquement à la deuxième occurrence et aux
   suivantes (`PDT`, `PDT-2`, `PDT-3`...). La détection considère **tout
   l'annuaire, tous sites confondus**, pour ce type — pas seulement le site
   sur lequel l'entité est en train d'être ajoutée. Raison : M-12
   (conversion manuelle d'un fichier généré par l'IA) doit pouvoir résoudre
   un tag `[TYP:ALIAS]` sans connaître le site d'origine du fichier ; si
   deux entités pouvaient porter le même code sur deux sites différents, la
   résolution deviendrait ambiguë dès que le fichier est traité hors du
   contexte d'un site précis. Ce mécanisme s'applique aussi bien au format
   court qu'étendu ; il n'est pas nécessaire pour le format opaque (espace
   de valeurs assez grand pour que la collision soit négligeable, mais une
   vérification reste de mise avant attribution).

## Conséquences

- L'algorithme de génération doit être déterministe à partir du nom pour un
  format donné, mais tenir compte de **tout l'annuaire existant pour ce
  type** (tous les `aliasParSite[].historique` de toutes les entités du
  même type, voir [ARCHITECTURE.md](../ARCHITECTURE.md)) pour détecter les
  collisions et appliquer le suffixe — pas seulement l'historique du site
  courant.
- Le suffixe de collision fait partie intégrante du pseudonyme et doit être
  conservé dans l'historique des alias du site concerné (M-09) au même
  titre que le reste.
- Si l'utilisateur change le format configuré pour un site après coup, les
  pseudonymes déjà attribués sur ce site ne sont pas régénérés
  rétroactivement (cohérent avec M-09 : l'historique complet des alias est
  toujours conservé) ; seules les nouvelles entités mentionnées sur ce site
  (ou les rotations futures, M-08) utiliseront le nouveau format.
