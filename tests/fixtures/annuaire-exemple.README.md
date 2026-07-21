# Jeu de données de test — annuaire-exemple

`annuaire-exemple.json` (et son équivalent `annuaire-exemple.xlsx`, format
[ADR-006](../../docs/adr/0006-export-import-excel.md)) contiennent un
annuaire **entièrement fictif** — 10 entités, structuré selon le modèle de
données de [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — à utiliser
pour développer et tester M-02, M-03/M-04, M-08, M-09, M-10 et M-13 sans
dépendre de vraies données (celles-ci restent dans
[`private/`](../../private/README.md)).

Aucun nom réel : "Pierre Dupont", "Acme Corporation", "Paris"... sont des
exemples génériques, pas des personnes/organisations réelles.

## Couverture

- Les **4 types** d'entités (PER, ORG, LIE, PRJ).
- Les **3 formats** de pseudonyme (court, étendu, opaque — voir
  [ADR-002](../../docs/adr/0002-format-pseudonyme.md)).
- Les **3 durées de vie** de site (`1s`, `1a`, `infini` — sites `site-chatgpt`,
  `site-claude`, `site-local-test` dans `fogbank.sites`).
- Un exemple de **rotation** (`ent-01`, Pierre Dupont : alias `PDT` expiré
  puis `PDT-2` actif).
- Un exemple de **collision** (`ent-02`, Paul Dumont : le code déterministe
  `PDT` était déjà pris par Pierre Dupont, y compris dans son historique
  expiré, d'où `PDT-3`).
- Un exemple de **nom à un seul mot** pour une entité de type lieu
  (`ent-07`, "Paris") — voir hypothèse ci-dessous.
- Deux entités dont l'alias **expire bientôt** (`ent-04`, `ent-10`, sur
  `site-local-test`, durée `1s`) — utile pour tester la logique de
  rotation de M-08 sans attendre.

## Hypothèses de modélisation (à confirmer lors du développement)

Ces points ne sont pas encore tranchés formellement dans les ADR — le jeu
de données fait un choix pour rester cohérent, mais ce choix reste ouvert :

1. **Suffixe de rotation vs suffixe de collision** : le même mécanisme de
   suffixe numérique (`-2`, `-3`...) est utilisé aussi bien quand une même
   entité change d'alias par rotation (`ent-01` : `PDT` → `PDT-2`) que
   quand deux entités différentes génèrent le même code (`ent-02` obtient
   `PDT-3` car `PDT` et `PDT-2` étaient déjà pris par `ent-01`, y compris
   dans son historique expiré). Alternative possible : traiter les deux
   cas séparément avec une notation différente.
2. **Portée de la détection de collision** : elle considère ici
   l'historique complet (y compris les alias expirés), pas seulement les
   alias actuellement actifs — cohérent avec M-09 (conservation complète
   de l'historique) mais à confirmer.
3. **Repli pour un nom à un seul mot** (`ent-07`, "Paris", format court) :
   règle provisoire notée dans [ADR-003](../../docs/adr/0003-typage-entites.md)
   (2 premières + 2 dernières lettres du mot unique) → `PA` + `IS` =
   `PAIS`. Point ouvert explicitement signalé dans l'ADR, pas encore
   arbitré.
