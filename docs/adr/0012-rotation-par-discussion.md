# ADR-012 — Rotation du pseudonyme par discussion, plus de rotation temporelle

**Statut** : acceptée
**Date** : 2026-07-31

## Contexte

M-08 générait jusqu'ici un nouvel alias selon une **durée de vie calendaire**
configurée par site (`dureeViePseudonyme` : `1s`/`1t`/`1a`/`infini`, voir
[ADR-002](0002-format-pseudonyme.md), [ARCHITECTURE.md](../ARCHITECTURE.md)),
vérifiée paresseusement (`expireLe`) à chaque insertion de mention.

Ce découpage temporel n'apporte pas la garantie recherchée : deux messages
envoyés à quelques minutes d'intervalle mais de part et d'autre d'une
échéance (ex: fin de semaine) changent d'alias sans raison liée au contenu,
alors qu'une même discussion qui s'étale sur plusieurs semaines garde le
même alias du début à la fin — la fenêtre de corrélation offerte à un tiers
(ou au site IA lui-même) dépend d'un calendrier arbitraire, pas de la
structure réelle des échanges.

## Décision

1. **Suppression de la rotation temporelle** : `dureeViePseudonyme` et ses
   valeurs (`1s`/`1t`/`1a`/`infini`) sont retirés du modèle. Le champ
   `expireLe` sur `aliasParSite` disparaît avec elle.
2. **Nouvelle politique de rotation, par site**, deux options seulement :
   - **Par discussion** : un nouvel alias est généré à chaque nouvelle
     discussion sur le site concerné ; l'alias reste stable du premier au
     dernier message de cette même discussion.
   - **Jamais** : l'alias attribué à une entité sur ce site reste le même
     indéfiniment (équivalent de l'ancien `infini`, conservé comme option,
     pas comme valeur par défaut implicite).
3. **Rotation toujours paresseuse** (principe inchangé, voir
   [ARCHITECTURE.md](../ARCHITECTURE.md) « Rotation ») : pas de tâche
   périodique — la politique « par discussion » se vérifie à la même étape
   que l'ancienne vérification d'`expireLe` (insertion d'une mention), en
   comparant l'identifiant de discussion courant à celui enregistré sur le
   dernier alias du site pour cette entité, plutôt qu'une date.

## Conséquences

- `fogbank.sites[].dureeViePseudonyme` → remplacé par
  `fogbank.sites[].politiqueRotation: "parDiscussion" | "jamais"`.
- `aliasParSite.expireLe` → remplacé par `aliasParSite.idDiscussion` (ou
  équivalent), écrit au moment de l'attribution de l'alias.
- **Ouvert, à trancher en implémentation** : fogbank ne modélise
  actuellement aucune notion de « discussion »/conversation (M-07 lit tout
  `document.body` sans distinguer une conversation d'une autre). Il faut un
  signal fiable de changement de discussion par site (ex: changement d'URL
  de conversation, nouvel identifiant dans le DOM, ou action explicite
  utilisateur « nouvelle discussion ») avant que l'option « par discussion »
  puisse réellement s'appliquer — voir action associée dans
  [bugs.md](../../bugs.md).
- UI à mettre à jour partout où l'ancienne durée était affichée ou
  configurée : bandeau de site du panneau (« Rotation : *durée* », voir
  [SPECS.md](../SPECS.md)), page d'options (`LIBELLES_DUREE`,
  `site-champ-duree`).
- Migration des sites déjà configurés avec une `dureeViePseudonyme` : à
  définir (repli probable sur « jamais », le plus proche du comportement
  `infini` existant) — pas de rotation rétroactive des alias déjà attribués,
  cohérent avec M-09 (historique toujours conservé).

## Sources

- [ADR-002](0002-format-pseudonyme.md) — modèle initial de
  `dureeViePseudonyme` par site
- [ARCHITECTURE.md](../ARCHITECTURE.md) — section « Rotation (M-08) »
