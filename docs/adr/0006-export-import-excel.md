# ADR-006 — Export / import de l'annuaire au format Excel

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

M-13 demande de pouvoir exporter l'annuaire (entités + historique complet
des alias) vers un fichier `.xlsx` local, et de l'importer en retour — pour
permettre une édition en masse hors extension (ex: préparation d'un
annuaire dans Excel) et une sauvegarde locale portable. L'opération doit
rester **entièrement locale** : aucun envoi du fichier vers un service
tiers, génération et lecture du `.xlsx` doivent se faire dans le navigateur.

> **Mise à jour** : le modèle de données a évolué — une entité a désormais
> un alias **indépendant par site** (`aliasParSite[]`, voir
> [ARCHITECTURE.md](../ARCHITECTURE.md)) plutôt qu'un alias unique. Le
> format à deux feuilles ci-dessous n'en tenait pas compte ; il passe à
> **trois feuilles** pour rester fidèle à la forme relationnelle réelle des
> données (voir Décision).

## Options considérées

| Option | Remarque |
|--------|----------|
| Génération manuelle du binaire `.xlsx` | Format ZIP+XML complexe, effort de réimplémentation injustifié |
| Bibliothèque cliente [SheetJS (`xlsx`)](https://www.npmjs.com/package/xlsx), édition Community, licence Apache-2.0 | Lecture/écriture `.xlsx` 100% côté client, aucune dépendance serveur, licence permissive compatible avec la publication du code sous AGPL-3.0 |
| Export CSV à la place d'Excel | Plus simple, mais ne répond pas à la demande explicite d'un format Excel, et gère moins bien les libellés/plusieurs feuilles |

## Décision

Utiliser la bibliothèque **SheetJS Community Edition (`xlsx`)**, incluse en
tant que script vendored dans `src/vendor/` (pas de CDN — les Content
Security Policies de Manifest V3 interdisent le chargement de script
distant). Cohérent avec la contrainte "vanilla JS, pas de bundler" :
inclusion via une simple balise `<script>`, sans étape de build.

Format retenu : classeur à **trois feuilles**, qui reflète directement la
forme relationnelle du modèle (une entité, plusieurs alias par site,
chacun avec son propre historique) plutôt que de dupliquer les champs de
l'entité sur autant de lignes que de sites utilisés (source d'incohérence
à l'édition/réimport).

- **Feuille "Entités"** (une ligne par entité) : `ID entité`, `Type`
  (PER/ORG/LOC/PRJ/MISC), `Nom réel`, `Email` (facultatif, pertinent
  seulement pour `PER`), `Créé le`. Pas de colonne `Format` : c'est une
  caractéristique du site, pas de l'entité (voir [ADR-002](0002-format-pseudonyme.md))
  — hors du périmètre de cet export, qui porte sur l'annuaire (M-13), pas
  sur la configuration des sites (M-01).
- **Feuille "AliasParSite"** (état courant, une ligne par couple
  entité/site) : `ID entité`, `Site`, `Alias actif`, `Expire le`.
- **Feuille "Historique"** (une ligne par alias jamais attribué sur un
  site donné, y compris expirés) : `ID entité`, `Site`, `Alias`,
  `Attribué le`, `Expiré le`.

L'export génère ce classeur et déclenche un téléchargement local (lien
`Blob` + `download`, pas de permission `downloads` nécessaire).
L'import lit un fichier sélectionné localement par l'utilisateur (`<input
type="file">`) et met à jour `chrome.storage.local` (voir
[ADR-005](0005-stockage-local.md)).

## Conséquences

- `src/vendor/xlsx.full.min.js` (ou équivalent) devient une dépendance
  vendored du projet — sa licence Apache-2.0 doit être mentionnée dans le
  README (attribution) en complément de la licence AGPL-3.0 du code propre
  au projet.
- Point ouvert pour l'UC détaillé de M-13 : stratégie de fusion à l'import
  quand une entité importée correspond déjà à une entité existante (clé de
  correspondance envisagée : `Type` + `Nom réel`) — écraser, fusionner
  l'historique, ou demander confirmation à l'utilisateur. Avec le modèle à
  trois feuilles, la fusion doit aussi traiter le cas d'une entité connue
  sur un site mais dont l'import apporte un alias pour un **nouveau**
  site : ajout de l'entrée `aliasParSite` plutôt que remplacement de
  l'entité entière. À trancher lors de la rédaction de l'UC détaillé, pas
  au niveau architecture.
- Le fichier `.xlsx` exporté contient des données réelles sensibles (noms
  en clair) : il doit être traité par l'utilisateur avec la même prudence
  que le contenu de `private/` (rappel à inclure dans l'UC détaillé et/ou
  l'interface d'export elle-même).
