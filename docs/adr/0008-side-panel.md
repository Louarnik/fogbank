# ADR-008 — Le side panel devient la surface principale de saisie

**Statut** : acceptée
**Date** : 2026-07-23

## Contexte

ADR-007 a retenu le fail-closed pour éviter une réécriture silencieusement ratée à
l'envoi, mais laissait intacte l'autre moitié du problème : **insérer** le tag dans le
champ du site lui-même. Trois itérations successives de `content.js`/`site-adapters/*`
ont toutes échoué sur les vrais sites (voir `bugs.md`) :

1. Repli générique par heuristique de position (premier bouton après le champ) —
   fonctionnait sur les fixtures, se trompait de zone dès qu'un vrai composer avait
   plusieurs boutons avant celui d'envoi.
2. Adaptateurs dédiés (`chatgpt.js`, `claude.js`) à sélecteurs exacts — toujours en échec
   après test réel, sans certitude sur la cause exacte (sélecteur périmé, Trusted Types,
   structure plus mouvante que prévu).
3. Scan de toute la page déclenché par stabilité — a résolu la restauration en lecture
   (M-07) mais ne change rien au problème d'**écriture** : ProseMirror/Lexical
   maintiennent un modèle de document interne qu'une écriture DOM classique n'atteint
   pas (voir ADR-007, Contexte) — c'est vrai à la frappe (menu `&`) comme à l'insertion.

Trois content scripts de production réécrits dans la même session pour le même problème
est un signal : le point de défaillance n'est pas un mauvais sélecteur ou une mauvaise
heuristique, c'est l'idée même d'agir *dans* la page du site pendant que l'utilisateur
compose.

## Spikes de validation

Avant toute réécriture de spec, deux spikes ont validé (ou invalidé) les points
bloquants :

- **S1 — écrasement total** : cibler un champ puis remplacer tout son contenu via
  `document.execCommand('insertText')` après sélection complète, y compris en rafale
  (plusieurs écrasements rapprochés). **Validé** sur Claude.ai, ChatGPT et Copilot grand
  public — les trois acceptent l'écrasement sans réécrire par-dessus, y compris en
  rafale (quelques échecs isolés au rechargement de page, jugés non bloquants — voir
  Conséquences, ciblage persistant).
- **S2 — ciblage par clic droit** : menu contextuel (`contexts: ["editable"]`) →
  `document.activeElement` au moment du clic → surlignage visuel de vérification.
  **Validé** : fiable sur les trois sites testés, le clic droit sur un champ éditable
  place bien le focus dessus avant que notre gestionnaire ne s'exécute.
- **Test complémentaire (M-07 façon panneau)** : lire tout le texte visible de la page
  (hors champs de saisie, même exclusion que le scan de UC-002) et résoudre les tags
  trouvés pour affichage dans le panneau plutôt que par substitution DOM. **Validé**
  fonctionnellement (bruit de texte non filtré constaté mais jugé non bloquant pour
  cette itération).

Détail d'implémentation du spike (superseded par ce document) :
`src/content/spike-s1-s2.js`, `src/sidepanel/` (premières versions).

## Décision

Le **side panel** devient la surface principale de composition. Le site IA n'est plus
qu'une **destination d'écriture** :

- La saisie (déclencheur `&`, calque de décoration — soulignement, infobulle, légende)
  vit **entièrement dans le panneau**, sur un champ que fogbank contrôle à 100 % — plus
  aucune tentative d'attacher `mention-menu.js`/`display.js` à un élément du site.
- Le **ciblage** d'un champ du site se fait par clic droit → « écrire ici » (menu
  contextuel, contexte `editable` natif) : le content script capture
  `document.activeElement`, le content script le mémorise pour l'onglet courant, et
  **persiste un descripteur du champ pour le site** (`fogbank.sites[].cibleEcriture` —
  voir Conséquences) afin qu'un retour ultérieur sur le même site retrouve
  automatiquement le même champ sans repasser par un clic droit.
- Le contenu du panneau est répliqué vers le champ ciblé par **écrasement total**
  (sélection complète + `execCommand('insertText')`), jamais par insertion au curseur —
  plus simple, et c'est le mécanisme validé par S1.
- La permission de domaine reste inchangée pour cette itération (whitelist a priori,
  ADR-004) — le passage à une permission demandée au clic droit (`activeTab` +
  `contextMenus`, remplaçant les `matches` larges des content scripts) est noté comme
  amélioration future, pas encore mis en œuvre ici faute de spike dédié (S4 du plan
  initial).

## Conséquences

- **M-03/M-04/M-05** (déclencheur `&`, ajout à la volée, calque de décoration)
  déménagent entièrement dans `sidepanel/` — voir UC-001 réécrit dans
  [SPECS.md](../SPECS.md). Le code sous-jacent (`EditorHandle`, `mention-menu.js`,
  `display.js`, `pseudonyme.js`) est **réutilisé sans modification** : ces modules
  n'ont jamais su ni eu besoin de savoir sur quelle page ils tournaient.
- **Nouveau macro-UC — ciblage persistant par site** : `fogbank.sites[]` gagne un champ
  `cibleEcriture` (descripteur best-effort : `id`, `tag`, `role`, `ariaLabel`,
  `placeholder`) régénéré à chaque clic droit. Au chargement d'une page, le content
  script tente de retrouver ce champ automatiquement (par `id` d'abord, puis par
  correspondance tag + libellé) avant de se rabattre sur « aucune cible, clic droit
  requis ». Ré-application manuelle toujours possible si l'auto-repérage échoue
  (changement de structure du site).
- `content/site-adapters/generic.js`, `chatgpt.js`, `claude.js` et `content/reception.js`
  sont **supprimés** (pas seulement mis de côté cette fois) : plus aucun composant ne
  cherche à identifier une zone de réponse ou un bouton d'envoi sur le site — la lecture
  se fait par scan de toute la page (hérité du choix déjà fait pour UC-002), écrite dans
  `content/ecriture.js`, qui devient le seul content script de production.
- `content.js` (orchestrateur historique) est remplacé par `content/ecriture.js`,
  volontairement réduit à quatre responsabilités : cibler, écrire (écrasement), lire
  (texte de la page), détecter une modification externe du champ ciblé (voir ADR-009).
- Le contrat d'adaptateur de site (`matches`, `getInputFields`,
  `getResponseContainer`, `isStreaming`, `onStreamingEnd`) disparaît : il n'a plus de
  raison d'être une fois qu'aucun composant ne cherche à identifier automatiquement un
  champ ou une zone sur le site (le ciblage est explicite, par clic droit).
- Le side panel devient un troisième point d'entrée UI aux côtés de la popup (statut
  rapide, activer/désactiver, voir `popup/`) et de la page d'options (CRUD annuaire et
  sites) — sans les remplacer.

## Sources

- `bugs.md` — historique des trois échecs successifs sur les vrais sites
- Session de test du 2026-07-23 — S1/S2 validés sur Claude.ai, ChatGPT, Copilot
- [ADR-007](0007-fail-closed.md) — fail-closed, dont ce document hérite le principe
  (le tag reste la source de vérité, jamais le vrai nom écrit dans un DOM qui part au
  réseau)
