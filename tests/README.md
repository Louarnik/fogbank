# Tests

Le développement se fait UC par UC (voir [docs/SPECS.md](../docs/SPECS.md))
contre des fixtures locales — des sites IA factices qui ne font aucun appel
réseau, utilisés pour vérifier :

- ce que l'extension enverrait réellement (panneau "Payload envoyé"),
  pour valider que le tag inséré via le menu `&` (M-04) est bien ce qui
  part au site IA, sans réécriture à l'envoi (fail-closed — voir
  [ADR-007](../docs/adr/0007-fail-closed.md)) ;
- la restauration automatique d'une réponse simulée contenant des
  pseudonymes (M-07).

Quatre fixtures, chacune avec son propre README détaillé :

| Fixture | Modélise | À utiliser pour |
|---|---|---|
| [`mock-ai-site/`](fixtures/mock-ai-site/) | Site générique, deux scénarios (`<textarea>` **et** `contenteditable`) | `generic.js`, les deux `EditorHandle` (R-63) |
| [`mock-claude-site/`](fixtures/mock-claude-site/) | Claude.ai (composer ProseMirror dans un `fieldset`, `data-is-streaming` par message, plusieurs éditeurs ProseMirror sur la page) | Futur `claude.js` |
| [`mock-copilot-site/`](fixtures/mock-copilot-site/) | Copilot grand public (`<textarea>` natif, pas de signal de fin de streaming) | Futur `copilot.js` |

Les trois fixtures « par site » reproduisent la structure DOM relevée dans
[`docs/recherche/constat-*.md`](../docs/recherche/) — **aucun sélecteur n'y
a été vérifié en direct** (voir chaque constat, §8, pour la sonde de
validation à rejouer avant implémentation et à chaque release). Pas encore
de fixture ChatGPT dédiée : `mock-ai-site` (scénario B, contenteditable) en
tient lieu pour l'instant.

## Jeu de données d'annuaire

[fixtures/annuaire-exemple.json](fixtures/annuaire-exemple.json) fournit un
annuaire fictif de 11 entités couvrant les 5 types, les 3 formats de
pseudonyme, la rotation et la collision d'alias — voir
[fixtures/annuaire-exemple.README.md](fixtures/annuaire-exemple.README.md)
pour le détail et les hypothèses de modélisation. À utiliser pour
développer M-02, M-08, M-09, M-10 et M-13 sans données réelles.

**Pré-chargé automatiquement** : `src/background/background.js` peuple
`chrome.storage.local` avec cet annuaire (et la whitelist des trois
fixtures locales) au premier démarrage de l'extension — charger
l'extension "unpacked" suffit, aucune saisie manuelle dans la console.
Détail dans `annuaire-exemple.README.md`, section « Chargement
automatique ».

Pas d'équivalent `.xlsx` maintenu à côté : un fixture binaire à retenir en
phase avec le JSON à chaque évolution du modèle (comme le renommage des
types ci-dessus) coûte plus qu'il n'apporte. Le format d'export/import
Excel reste spécifié dans [ADR-006](../docs/adr/0006-export-import-excel.md)
et sera testé contre un fichier généré par M-13 lui-même le moment venu,
pas contre un exemple statique à maintenir à la main.
