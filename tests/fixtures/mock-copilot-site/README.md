# Fixture de test — Copilot factice

`index.html` reproduit la structure DOM relevée sur le vrai **Copilot grand
public** (`copilot.microsoft.com`), afin de développer et tester un futur
adaptateur `copilot.js` **sans dépendre du vrai site** ni envoyer quoi que ce
soit sur le réseau.

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
  scan `MutationObserver` générique de fogbank doit couvrir pour ce site.

## Contrôles de test

- **La réception est automatique** : cliquer sur "Envoyer" déclenche seul
  une réponse simulée en streaming qui reprend le contenu envoyé entre deux
  blocs de texte de remplissage (Lorem ipsum) — pratique pour vérifier la
  restauration d'un tag `[TYP:CODE]` sans ressaisir de réponse à la main.
  Comme sur le vrai site, aucun attribut ni événement ne signale la fin :
  seul un indicateur « ● en train d'écrire… » transitoire accompagne le
  streaming, à dessein, pour exercer une détection par inactivité plutôt
  que par signal explicite.
- **FR / EN (placeholder)** : bascule le `placeholder` du champ entre
  `Ask me anything...` et `Posez-moi une question...`, pour vérifier qu'un
  sélecteur `textarea[placeholder*="Ask" i]` ne casse pas silencieusement en
  UI française (piège documenté dans le constat).
- Panneau replié **🧪 Contrôles de test** : reste disponible pour composer
  une réponse arbitraire (tag inconnu, tag cassé...), instantanée ou en
  streaming.

## Utilisation

Identique à [`mock-ai-site/README.md`](../mock-ai-site/README.md) : charger
l'extension "unpacked", autoriser l'accès aux URL de fichiers, ouvrir
`index.html` en `file://`. La whitelist de cette fixture (`site-local-test-copilot`)
est déjà pré-chargée par `background.js` au premier démarrage — pas d'étape
manuelle.

## Fiabilité

Comme précisé dans le constat source : **aucun sélecteur n'a été vérifié en
direct** contre le vrai `copilot.microsoft.com`, un site qui change
d'interface plus souvent que ChatGPT ou Claude.ai. Rejouer la sonde de
validation du constat (§8) avant d'implémenter `copilot.js`, et à chaque
changement de comportement observé.
