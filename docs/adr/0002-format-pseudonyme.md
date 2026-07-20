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
3. Le format actif est un paramètre de configuration (portée à définir
   précisément dans l'architecture cible — a priori par site, cohérent avec
   la configuration de durée de vie de l'ADR sur M-01/M-08).
4. **Gestion des collisions** : si deux personnes différentes génèrent le
   même code reconnaissable (ex: Pierre Dupont et Paul Dumont → `PDT` tous
   les deux), un suffixe numérique est ajouté automatiquement à la
   deuxième occurrence et aux suivantes (`PDT`, `PDT-2`, `PDT-3`...). Ce
   mécanisme s'applique aussi bien au format court qu'étendu ; il n'est pas
   nécessaire pour le format opaque (espace de valeurs assez grand pour que
   la collision soit négligeable, mais une vérification reste de mise avant
   attribution).

## Conséquences

- L'algorithme de génération doit être déterministe à partir du nom pour un
  format donné, mais tenir compte de l'annuaire existant pour détecter les
  collisions et appliquer le suffixe.
- Le suffixe de collision fait partie intégrante du pseudonyme et doit être
  conservé dans l'historique des alias (M-09) au même titre que le reste.
- Si l'utilisateur change le format actif après coup, les pseudonymes déjà
  attribués ne sont pas régénérés rétroactivement (cohérent avec M-09 :
  l'historique complet des alias est toujours conservé).
