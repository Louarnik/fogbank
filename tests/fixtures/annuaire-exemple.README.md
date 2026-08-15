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

## Chargement manuel

Ce fichier n'est pas lu directement par l'extension (`tests/` est hors de
l'arborescence `src/` chargée par le navigateur) et rien ne le charge plus
automatiquement : le mécanisme de seed au premier démarrage
(`src/background/donnees-test.js`, chargé via `chrome.runtime.onInstalled`)
a été retiré avant la première publication publique (une extension publique
ne doit jamais injecter de fausses entités dans le storage d'un vrai
utilisateur).

Pour peupler `chrome.storage.local` en développement, coller le contenu de
ce fichier dans la console du service worker
(`chrome://extensions` → détails de fogbank → « Service worker ») :
```js
chrome.storage.local.set({
  'fogbank.annuaire': /* … contenu de fogbank.annuaire ci-dessous … */,
  'fogbank.sites': /* … contenu de fogbank.sites ci-dessous … */,
});
```

## Couverture

- Les **5 types** d'entités (PER, ORG, LOC, PRJ, MISC — voir
  [ADR-003](../../docs/adr/0003-typage-entites.md)).
- Format de pseudonyme et politique de rotation ne sont plus configurables
  par site sur cette branche : toujours **opaque** (voir
  [ADR-002](../../docs/adr/0002-format-pseudonyme.md)) et toujours **par
  discussion** (voir [ADR-012](../../docs/adr/0012-rotation-par-discussion.md))
  — le choix par site vit sur `feature/choix-rotation-format`. Les codes
  d'alias de ce jeu de données (`PDT`, `PIDU`, `MALE`...) datent d'avant ce
  changement : ils restent des exemples valides de la mécanique de
  collision/rotation, même s'ils ne ressemblent plus à ce que génèrerait
  le code actuel (chaînes opaques à 5 caractères).
- **5 sites** au total : les trois grands sites IA (`site-chatgpt`,
  `site-claude`) plus les trois fixtures locales (`site-local-test` →
  `mock-ai-site`, `site-local-test-claude` → `mock-claude-site`,
  `site-local-test-copilot` → `mock-copilot-site`), toutes **pré-activées
  de base par `background.js`** (voir plus bas) pour tester sans étape
  manuelle de whitelist.
- Une entité mentionnée sur **deux sites** (`ent-01`, Pierre Dupont :
  `PDT-2` sur `site-chatgpt`, `PIDU` sur `site-claude`) — chaque site a son
  propre alias, indépendant.
- Un exemple de **rotation** (`ent-01` sur `site-chatgpt` : alias `PDT`
  supplanté par `PDT-2`, conservés tous deux dans l'historique).
- Un exemple de **collision, résolue globalement** (`ent-02`, Paul Dumont :
  le code `PDT` était déjà pris par Pierre Dupont — y compris dans son
  historique sur `site-chatgpt` — d'où `PDT-3`). L'unicité du code est
  vérifiée sur tout l'annuaire (tous sites confondus) pour le même type,
  pas seulement sur le site où l'entité est ajoutée — voir hypothèse
  ci-dessous.
- Un champ **email facultatif** pour les personnes : renseigné pour
  `ent-01` et `ent-03`, laissé à `null` pour `ent-02` et `ent-04` (montre
  que le champ est réellement optionnel).
- Un exemple de **nom à un seul mot** pour une entité de type lieu
  (`ent-07`, "Paris").
- Deux entités sur `site-local-test` (`ent-04`, `ent-10`) — utile pour
  tester la rotation par discussion de M-08 en simulant simplement un
  changement d'URL d'onglet.
- Un exemple de type **`MISC`** (`ent-11`, "Opération Mistral") — la
  catégorie fourre-tout ajoutée par [ADR-003](../../docs/adr/0003-typage-entites.md)
  pour toute entité sensible qui ne rentre dans aucun des quatre autres
  types.

## Hypothèses de modélisation (à confirmer lors du développement)

Ce point n'est pas encore tranché formellement dans les ADR — le jeu de
données fait un choix pour rester cohérent, mais ce choix reste ouvert :

1. **Suffixe de rotation vs suffixe de collision** : le même mécanisme de
   suffixe numérique (`-2`, `-3`...) est utilisé aussi bien quand une même
   entité change d'alias par rotation sur un site (`ent-01` sur
   `site-chatgpt` : `PDT` → `PDT-2`) que quand deux entités différentes
   génèrent le même code (`ent-02` obtient `PDT-3` car `PDT` et `PDT-2`
   étaient déjà pris par `ent-01`, y compris dans son historique).
   Alternative possible : traiter les deux cas séparément avec une
   notation différente.
