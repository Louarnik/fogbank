# Fixture de test — Claude.ai factice

`index.html` reproduit la structure DOM relevée sur le vrai Claude.ai, pour
développer et tester un futur adaptateur `claude.js` **sans dépendre du vrai
site** ni envoyer quoi que ce soit sur le réseau.

Contrairement à [`mock-ai-site/`](../mock-ai-site/) (générique, deux
scénarios `<textarea>`/`contenteditable`), cette fixture ne modélise que ce
qui a été relevé pour Claude.ai :

- **Composer** : `div.ProseMirror[contenteditable]` dans un `<fieldset>`,
  bouton d'envoi porteur d'un `aria-label` traduit selon la langue de
  l'interface. **Ancré en bas du viewport** (`position: fixed`), comme sur
  le vrai Claude.ai — reproduit le cas où le menu `&` et l'infobulle du
  calque de décoration doivent basculer au-dessus du curseur plutôt que de
  partir hors écran (bug trouvé en testant contre cette fixture, voir
  `docs/SPECS.md` UC-001).
- **Piège volontaire** : un deuxième `div.ProseMirror[contenteditable]`
  hors composer (« Renommer la conversation »), pour vérifier qu'un
  adaptateur qualifie bien le champ via son conteneur plutôt que de prendre
  le premier `ProseMirror` trouvé sur la page.
- **Fil de conversation** : tours `.group/conversation-turn`, message
  utilisateur `[data-testid="user-message"]`, message assistant
  `.font-claude-response[data-is-streaming]` avec sa barre d'actions
  (`[data-message-action-bar]`, bouton `[data-testid="action-bar-copy"]`).
  `data-is-streaming` est porté **par le message lui-même** — plus précis
  que le signal générique de `mock-ai-site` (attribut sur toute la zone de
  réponse).

## Contrôles de test

- **La réception est automatique** : cliquer sur "Envoyer" déclenche seul
  une réponse simulée en streaming qui reprend le contenu envoyé entre deux
  blocs de texte de remplissage (Lorem ipsum) — pratique pour vérifier la
  restauration d'un tag `[TYP:CODE]` sans ressaisir de réponse à la main.
  Le signal de fin est porté par `data-is-streaming` sur le message
  assistant lui-même (pas par un événement, contrairement à `mock-ai-site`).
- **FR / EN (aria-label)** : bascule l'`aria-label` du bouton d'envoi entre
  `Send message` et `Envoyer le message`, pour vérifier qu'un sélecteur
  `button[aria-label*="Send" i]` ne casse pas silencieusement en UI
  française (piège documenté dans le constat).
- Panneau replié **🧪 Contrôles de test** : reste disponible pour composer
  une réponse arbitraire (tag inconnu, tag cassé...), avec les mêmes deux
  mécanismes d'injection (instantanée / streaming) que `mock-ai-site`.

## Utilisation

Identique à [`mock-ai-site/README.md`](../mock-ai-site/README.md) : charger
l'extension "unpacked", autoriser l'accès aux URL de fichiers, ouvrir
`index.html` en `file://`. La whitelist de cette fixture (`site-local-test-claude`)
est déjà pré-chargée par `background.js` au premier démarrage — pas d'étape
manuelle.

## Fiabilité

Comme précisé dans le constat source : **aucun sélecteur n'a été vérifié en
direct** contre le vrai `claude.ai`. Rejouer la sonde de validation du
constat (§8) avant d'implémenter `claude.js`, et à chaque changement de
comportement observé.
