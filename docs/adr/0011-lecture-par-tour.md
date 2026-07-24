# ADR-011 — Lecture par tour (bulles), best-effort par site, jamais côté écriture

**Statut** : acceptée
**Date** : 2026-07-24

## Contexte

UC-002 (implémenté) lit tout le texte visible de `document.body`, hors champs de
saisie, en un **seul bloc** — décision prise dans ADR-008/UC-002 précisément pour
éviter de réintroduire un contrat d'adaptateur par site (`getResponseContainer`,
etc.) côté écriture, contrat abandonné après trois échecs successifs de détection/
injection sur les vrais sites.

La référence visuelle du side panel (voir
[docs/design/side-panel-ergonomie/](../design/side-panel-ergonomie/)) découpe
l'historique en **bulles par message** (bordure colorée par rôle, actions copier/
localiser par bulle). Un premier passage a documenté cet écart comme assumé, sans
chercher à le résoudre. En relisant un extrait réel de Claude.ai, le bloc unique
s'est avéré concrètement peu lisible :

```
Vous avez dit : testtest22 juil.Claude a répondu : Hi Frédéric!Hi Frédéric! Just
checking in — how can I help today?Vous avez dit : Ceci est un test...
```

Le texte est doublé (probablement un libellé d'accessibilité — « Vous avez dit »/
« *Assistant* a répondu » — capturé par le `TreeWalker` en plus du texte visible
qu'il précède) et les tours ne sont pas séparés visuellement. Un simple filtrage
du bruit ne rendrait pas les bulles ; il fallait soit accepter cette limite, soit
identifier les tours dans le DOM.

## Décision

Réintroduire une identification par site, mais **uniquement côté lecture**, avec
repli automatique et sans conséquence sur le site en cas d'échec — ce qui change
fondamentalement le calcul de risque par rapport à ADR-008 :

- **Écriture (ADR-008, inchangé)** : un sélecteur qui se trompe casse la
  composition de l'utilisateur ou fait échouer silencieusement un envoi — c'est
  ce qui a justifié l'abandon du contrat d'adaptateur.
- **Lecture (cet ADR)** : un sélecteur qui se trompe ne fait que renvoyer `null`
  (aucun tour trouvé) — le panneau se rabat alors sur le bloc de texte unique
  déjà existant. Aucune écriture, aucun risque de casser le site.

`src/content/profils-lecture.js` définit un petit profil best-effort par site
préactivé (ChatGPT, Claude.ai, Copilot grand public) : un sélecteur CSS
identifiant chaque tour, et une fonction attribuant le rôle (utilisateur/
assistant). `obtenirTours(hostname)` renvoie `null` si aucun profil ne
correspond au site ou si le profil ne trouve aucun élément — dans les deux cas,
`ecriture.js` continue de calculer `texteVisibleHorsChamps()` en parallèle,
utilisé tel quel comme repli.

Sélecteurs retenus (voir `tests/fixtures/mock-claude-site/`,
`tests/fixtures/mock-copilot-site/` pour Claude.ai et Copilot ; ChatGPT non
vérifié contre une fixture locale, à valider contre le vrai site) :

| Site | Sélecteur | Rôle |
|---|---|---|
| Claude.ai | `[data-testid="user-message"]`, `.font-claude-response` | selon le sélecteur qui matche |
| ChatGPT | `[data-message-author-role]` | valeur de l'attribut (`user`/`assistant`) |
| Copilot | `[data-content="user-message"]`, `[data-content="ai-message"]` | selon le sélecteur qui matche |

## Conséquences

- **UC-002** révisé : le message `fogbank:page-stable` (et la réponse à
  `fogbank:lire-clair`) porte désormais `tours` (tableau `{index, role, texte}`,
  ou `null`) en plus de `texte` (bloc unique, toujours calculé).
- **Nouvelle action « localiser » par bulle** (`fogbank:localiser-tour`,
  `{index}`) : re-requête le même sélecteur au moment du clic et scrolle vers
  l'élément trouvé — plus fiable que l'ancienne recherche par sous-chaîne
  (`fogbank:localiser`, toujours utilisée en repli bloc unique), qui échoue dès
  que le texte affiché est sous sa forme résolue plutôt que le tag brut.
- Le panneau affiche des bulles (`#bulles-historique`) quand `tours` est non vide,
  sinon le bloc unique (`#texte-clair`) — jamais les deux, jamais d'échec entre
  les deux modes.
- **Pas de nouveau contrat d'adaptateur d'écriture** : `profils-lecture.js` n'est
  jamais utilisé pour cibler un champ ou écrire — le ciblage (UC-003) et
  l'écrasement (UC-004) restent inchangés, sans sélecteur par site.
- **Limite assumée** : les sélecteurs peuvent se périmer si un site change sa
  structure — dégradation silencieuse vers le bloc unique, jamais une erreur
  bloquante. Pas de garde-fou de validation en continu (voir aussi UC-005, même
  logique de « sonde à revalider avant chaque release » déjà appliquée aux
  fixtures de test).
- Le filtrage des libellés d'accessibilité dupliqués (le « Vous avez dit… »
  observé dans le Contexte) n'est pas traité explicitement : les sélecteurs par
  tour ciblant directement l'élément de message (pas un conteneur englobant plus
  large), ce bruit ne devrait pas s'y retrouver — à confirmer contre le vrai
  site, pas seulement contre les fixtures locales.

## Sources

- [docs/design/side-panel-ergonomie/](../design/side-panel-ergonomie/) — bulles
  par message dans le prototype haute fidélité
- `tests/fixtures/mock-claude-site/`, `tests/fixtures/mock-copilot-site/` —
  sélecteurs vérifiés localement
- [ADR-008](0008-side-panel.md) — dont ce document distingue explicitement le
  risque d'écriture (inchangé) du risque de lecture (ce qui justifie la
  décision inverse ici)
