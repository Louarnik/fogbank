# Tests

Le développement se fait UC par UC (voir [docs/SPECS.md](../docs/SPECS.md))
contre des fixtures locales — des sites IA factices qui ne font aucun appel
réseau, utilisés pour vérifier :

- ce que l'extension enverrait réellement (panneau "Payload envoyé"),
  pour valider que le tag inséré via le menu `&` est bien ce qui part au
  site IA, par écrasement total et sans réécriture séparée à l'envoi (voir
  [ADR-008](../docs/adr/0008-side-panel.md)) ;
- la restauration automatique d'une réponse simulée contenant des
  pseudonymes (M-07).

Quatre fixtures, chacune avec son propre README détaillé :

| Fixture | Modélise | À utiliser pour |
|---|---|---|
| [`mock-ai-site/`](fixtures/mock-ai-site/) | Site générique, deux scénarios (`<textarea>` **et** `contenteditable`) | `generic.js`, les deux `EditorHandle` |
| [`mock-claude-site/`](fixtures/mock-claude-site/) | Claude.ai (composer ProseMirror dans un `fieldset`, `data-is-streaming` par message, plusieurs éditeurs ProseMirror sur la page) | Futur `claude.js` |
| [`mock-copilot-site/`](fixtures/mock-copilot-site/) | Copilot grand public (`<textarea>` natif, pas de signal de fin de streaming) | Futur `copilot.js` |

Les trois fixtures « par site » reproduisent la structure DOM relevée sur
les vrais sites — **aucun sélecteur n'y a été vérifié en direct**, à
revalider avant implémentation et à chaque release. Pas encore de fixture
ChatGPT dédiée : `mock-ai-site` (scénario B, contenteditable) en tient lieu
pour l'instant.

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

## Test automatisé — conversion de fichiers (M-12, UC-006)

[`conversion-fichier.test.js`](conversion-fichier.test.js) (`npm test`) est
le seul test automatisé du projet (le reste se fait UC par UC contre les
fixtures de sites ci-dessus, à la main dans le navigateur). Il charge le
vrai code de production (`src/content/pseudonyme.js`,
`src/content/conversion-fichier.js`) dans un bac à sable Node (`vm`), sans
navigateur, et vérifie sur trois types de fichiers texte simples
(`.txt`, `.md`, `.html` — voir
[fixtures/conversion-fichier/](fixtures/conversion-fichier/) ; pas de
`.csv`, hors périmètre actuel) :

- aucun nom réel ne subsiste après pseudonymisation ;
- chaque entité mentionnée reçoit bien son tag `[TYP:ALIAS]` ;
- les caractères spéciaux français (accents, `«guillemets»`, tiret
  cadratin) survivent intacts à la pseudonymisation ;
- l'aller-retour `restaurer(pseudonymiser(texte))` redonne exactement le
  texte d'origine, à l'octet près.
