# Jeu de données de test — annuaire-exemple

`annuaire-exemple.json` contient un annuaire **entièrement fictif** — 11
entités, structuré selon le modèle de données de
[docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md) — à utiliser pour
développer et tester M-01, M-02, M-08, M-09, M-10 et M-13 sans dépendre de
vraies données (celles-ci restent dans [`private/`](../../private/README.md)).

Pas d'équivalent `.xlsx` maintenu à côté de ce JSON : un fixture binaire à
retenir manuellement en phase à chaque évolution du modèle (comme le
renommage des types en `PER/ORG/LOC/PRJ/MISC`) coûte plus qu'il n'apporte.
Le format d'export/import reste spécifié dans
[ADR-006](../../docs/adr/0006-export-import-excel.md) ; il sera testé
contre un fichier généré par M-13 lui-même, pas contre un exemple statique.

Aucun nom réel : "Pierre Dupont", "Acme Corporation", "Paris"... sont des
exemples génériques, pas des personnes/organisations réelles.

## Chargement automatique

Ce fichier n'est pas lu directement par l'extension (`tests/` est hors de
l'arborescence `src/` chargée par le navigateur). Une copie fonctionnellement
identique vit dans
[`src/background/donnees-test.js`](../../src/background/donnees-test.js) :
`background.js` la charge dans `chrome.storage.local` au premier démarrage
(`chrome.runtime.onInstalled`), **seulement si aucune donnée n'existe déjà**
— un rechargement de l'extension pendant le développement n'écrase donc pas
des modifications faites depuis (via la page d'options, une fois M-01/M-02
construits). Charger l'extension "unpacked" suffit à pouvoir tester tout de
suite, sans étape manuelle dans la console.

**À retirer avant toute release réelle** (voir le commentaire en tête de
`donnees-test.js`) : ce mécanisme n'a de sens que pour le développement.
Si ce fichier JSON évolue, reporter le changement à la main dans
`donnees-test.js` — pas de génération automatique entre les deux.

## Couverture

- Les **5 types** d'entités (PER, ORG, LOC, PRJ, MISC — voir
  [ADR-003](../../docs/adr/0003-typage-entites.md)).
- Les **3 formats** de pseudonyme, chacun configuré **au niveau du site**
  (voir [ADR-002](../../docs/adr/0002-format-pseudonyme.md)) : `court` sur
  `site-chatgpt`, `etendu` sur `site-claude`, `opaque` sur
  `site-local-test` (`fogbank.sites[].formatPseudonyme`).
- Les **3 durées de vie** de site (`1a`, `infini`, `1s`), réparties sur
  **5 sites** au total : les trois grands sites IA (`site-chatgpt`,
  `site-claude`) plus les trois fixtures locales
  (`site-local-test` → `mock-ai-site`, `site-local-test-claude` →
  `mock-claude-site`, `site-local-test-copilot` → `mock-copilot-site`),
  toutes **pré-activées de base par `background.js`** (voir plus bas) pour
  tester sans étape manuelle de whitelist.
- Une entité mentionnée sur **deux sites, avec deux styles différents**
  (`ent-01`, Pierre Dupont : `PDT-2` sur `site-chatgpt` — format court,
  avec rotation — et `PIDU` sur `site-claude` — format étendu). Illustre
  que le format suit le site, pas l'entité.
- Un exemple de **rotation** (`ent-01` sur `site-chatgpt` : alias `PDT`
  expiré puis `PDT-2` actif).
- Un exemple de **collision, résolue globalement** (`ent-02`, Paul Dumont :
  le code déterministe `PDT` était déjà pris par Pierre Dupont — y compris
  dans son historique expiré sur `site-chatgpt` — d'où `PDT-3`). L'unicité
  du code est vérifiée sur tout l'annuaire (tous sites confondus) pour le
  même type, pas seulement sur le site où l'entité est ajoutée — voir
  hypothèse 2 ci-dessous.
- Un champ **email facultatif** pour les personnes : renseigné pour
  `ent-01` et `ent-03`, laissé à `null` pour `ent-02` et `ent-04` (montre
  que le champ est réellement optionnel).
- Un exemple de **nom à un seul mot** pour une entité de type lieu
  (`ent-07`, "Paris") — voir hypothèse 3 ci-dessous.
- Deux entités dont l'alias **expire bientôt** (`ent-04`, `ent-10`, sur
  `site-local-test`, durée `1s`) — utile pour tester la logique de
  rotation de M-08 sans attendre.
- Un exemple de type **`MISC`** (`ent-11`, "Opération Mistral") — la
  catégorie fourre-tout ajoutée par [ADR-003](../../docs/adr/0003-typage-entites.md)
  pour toute entité sensible qui ne rentre dans aucun des quatre autres
  types.

## Hypothèses de modélisation (à confirmer lors du développement)

Ces points ne sont pas encore tranchés formellement dans les ADR — le jeu
de données fait un choix pour rester cohérent, mais ce choix reste ouvert :

1. **Suffixe de rotation vs suffixe de collision** : le même mécanisme de
   suffixe numérique (`-2`, `-3`...) est utilisé aussi bien quand une même
   entité change d'alias par rotation sur un site (`ent-01` sur
   `site-chatgpt` : `PDT` → `PDT-2`) que quand deux entités différentes
   génèrent le même code (`ent-02` obtient `PDT-3` car `PDT` et `PDT-2`
   étaient déjà pris par `ent-01`, y compris dans son historique expiré).
   Alternative possible : traiter les deux cas séparément avec une
   notation différente.
2. **Portée de la détection de collision : globale par type, pas par
   site.** Elle considère tout l'annuaire (toutes les entités du même
   type, tous sites confondus, y compris leur historique expiré) — pas
   seulement le site sur lequel l'entité est ajoutée. Raison : M-12
   (conversion manuelle d'un fichier généré par l'IA) doit pouvoir
   résoudre un tag `[TYP:CODE]` sans connaître le site d'origine du
   fichier ; deux entités portant le même code sur deux sites différents
   rendraient cette résolution ambiguë. C'est pour ça que Pierre Dupont
   (`ent-01`) utilise `PIDU` sur `site-claude` et non `PDT` : même si
   `site-claude` a son propre format (étendu), le code choisi doit rester
   unique dans tout l'annuaire pour le type `PER`.
3. **Repli pour un nom à un seul mot** (`ent-07`, "Paris", format court) :
   règle provisoire notée dans [ADR-003](../../docs/adr/0003-typage-entites.md)
   (2 premières + 2 dernières lettres du mot unique) → `PA` + `IS` =
   `PAIS`. Point ouvert explicitement signalé dans l'ADR, pas encore
   arbitré.
