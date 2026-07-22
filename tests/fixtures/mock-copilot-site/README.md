# Fixture de test — Copilot factice

`index.html` reproduit la structure DOM relevée dans
[`docs/recherche/constat-copilot.md`](../../../docs/recherche/constat-copilot.md)
pour **Copilot grand public** (`copilot.microsoft.com`), afin de développer
et tester un futur adaptateur `copilot.js` **sans dépendre du vrai site** ni
envoyer quoi que ce soit sur le réseau.

Contrairement à [`mock-ai-site/`](../mock-ai-site/) (générique, deux
scénarios `<textarea>`/`contenteditable`), cette fixture ne modélise que ce
que le constat décrit pour Copilot :

- **Composer** : `<textarea>` natif (pas de ProseMirror, pas de
  `contenteditable`) — le seul des trois sites où l'état affiché est l'état
  réel. Placeholder traduit selon la langue de l'interface.
- **Réponse** : `div[data-content="ai-message"]` portant
  `[data-message-author="bot"]`, corps dans `.group/ai-message-item`.
- **Aucun signal de fin de streaming** : volontairement absent, comme sur le
  vrai site (constat, §4.3 — « aucun attribut équivalent à
  `data-is-streaming` n'a été relevé »). La détection n'y est possible que
  par **stabilité du texte** (~2,5 s sans mutation), exactement ce que le
  repli `MutationObserver` générique de fogbank doit couvrir pour ce site
  (voir [ADR-007](../../../docs/adr/0007-fail-closed.md), R-58).

## Contrôles de test

- **FR / EN (placeholder)** : bascule le `placeholder` du champ entre
  `Ask me anything...` et `Posez-moi une question...`, pour vérifier qu'un
  sélecteur `textarea[placeholder*="Ask" i]` ne casse pas silencieusement en
  UI française (piège documenté dans le constat).
- Panneau replié **🧪 Contrôles de test** : réception instantanée, ou
  streaming avec un indicateur « ● en train d'écrire… » transitoire mais
  **sans** attribut ni événement de fin — à dessein, pour exercer une
  détection par inactivité plutôt que par signal explicite.

## Utilisation

Identique à [`mock-ai-site/README.md`](../mock-ai-site/README.md) : ouvrir
`index.html` en `file://`, autoriser l'accès aux URL de fichiers pour
l'extension, puis ajouter la page à la whitelist une fois M-01 implémenté.

## Fiabilité

Comme précisé dans le constat source : **aucun sélecteur n'a été vérifié en
direct** contre le vrai `copilot.microsoft.com`, un site qui change
d'interface plus souvent que ChatGPT ou Claude.ai. Rejouer la sonde de
validation du constat (§8) avant d'implémenter `copilot.js`, et à chaque
changement de comportement observé.
