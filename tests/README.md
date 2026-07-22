# Tests

Le développement se fait UC par UC (voir [docs/SPECS.md](../docs/SPECS.md))
contre des fixtures locales — des sites IA factices qui ne font aucun appel
réseau, utilisés pour vérifier :

- ce que l'extension enverrait réellement (panneau "Payload envoyé"),
  pour valider la substitution des mentions par leur pseudonyme (M-06,
  à refondre en garde-fou fail-closed — voir
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

[fixtures/annuaire-exemple.json](fixtures/annuaire-exemple.json) (et son
équivalent [fixtures/annuaire-exemple.xlsx](fixtures/annuaire-exemple.xlsx))
fournissent un annuaire fictif de 10 entités couvrant les 4 types, les 3
formats de pseudonyme, la rotation et la collision d'alias — voir
[fixtures/annuaire-exemple.README.md](fixtures/annuaire-exemple.README.md)
pour le détail et les hypothèses de modélisation. À utiliser pour
développer M-02, M-08, M-09, M-10 et M-13 sans données réelles.
