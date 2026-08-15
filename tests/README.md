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
annuaire fictif de 11 entités couvrant les 5 types, la rotation et la
collision d'alias — voir
[fixtures/annuaire-exemple.README.md](fixtures/annuaire-exemple.README.md)
pour le détail et les hypothèses de modélisation. À utiliser pour
développer M-02, M-08, M-09 et M-13 sans données réelles.

**Chargement manuel** (aucun pré-chargement automatique — retiré avant la
première publication publique, voir `bugs.md`) : coller le contenu du
fichier dans la console du service worker (`chrome://extensions` → détails
de fogbank → « Service worker ») via
`chrome.storage.local.set({ 'fogbank.annuaire': [...], 'fogbank.sites': [...] })`.

Pas d'équivalent `.xlsx` maintenu à côté : un fixture binaire à retenir en
phase avec le JSON à chaque évolution du modèle (comme le renommage des
types ci-dessus) coûte plus qu'il n'apporte. Le format d'export/import
Excel reste spécifié dans [ADR-006](../docs/adr/0006-export-import-excel.md)
et sera testé contre un fichier généré par M-13 lui-même le moment venu,
pas contre un exemple statique à maintenir à la main.

Pas de test automatisé pour l'instant (voir bugs.md, « Ajouter des tests
automatisés... ») — tout se fait UC par UC contre les fixtures de sites
ci-dessus, à la main dans le navigateur.

## Cas de test — persistance de l'annuaire multi-sessions (M-02/M-08/M-09)

Pas de harnais `chrome.storage` automatisable pour l'instant (voir bugs.md,
« Ajouter des tests automatisés... ») — à dérouler manuellement dans le
navigateur, comme le reste des UC ci-dessus.

1. **Redémarrage du navigateur** : ajouter une entité dans `options/`,
   fermer complètement le navigateur, le rouvrir → l'entité doit toujours
   être là. `chrome.runtime.onInstalled` (`background.js`) ne se
   redéclenche pas à chaque session ; rien ne doit dépendre à tort de lui
   pour la persistance de base.
2. **Écriture concurrente entre deux surfaces** : ouvrir `options/` sur un
   onglet, déclencher une rotation d'alias dans le panneau d'un autre
   onglet (écriture `sidepanel.js#persisterAnnuaire`, **sans relecture**),
   puis enregistrer un changement dans `options/` (qui **relit** avant
   d'écrire, `options.js#mettreAJourAnnuaire`) → vérifier que la rotation
   du panneau n'est pas écrasée.
3. **Deux side panels simultanés** sur deux sites différents, chacun
   déclenchant `obtenirOuCreerAlias` à quelques secondes d'intervalle → les
   deux alias doivent apparaître dans l'annuaire final, sans que le
   listener `chrome.storage.onChanged` (`sidepanel.js`, dans
   `chargerDonnees`/écoute des changements) n'en perde un par écrasement de
   sa copie locale.
4. **Échec silencieux de `chrome.storage.local.set`** (simulable en
   remplissant le quota, ou en coupant l'extension au mauvais moment) juste
   après une rotation dans le panneau (`persisterAnnuaire`, qui ne fait
   qu'un `.catch(console.error)` sans retry ni UI d'erreur) → vérifier si
   l'alias reste correct en mémoire mais disparaît au reload, et si
   l'utilisateur peut s'en rendre compte autrement que dans la console.
