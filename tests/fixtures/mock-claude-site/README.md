# Fixture de test — Claude.ai factice

`index.html` reproduit la structure DOM relevée dans
[`docs/recherche/constat-claude.md`](../../../docs/recherche/constat-claude.md),
pour développer et tester un futur adaptateur `claude.js` **sans dépendre du
vrai site** ni envoyer quoi que ce soit sur le réseau.

Contrairement à [`mock-ai-site/`](../mock-ai-site/) (générique, deux
scénarios `<textarea>`/`contenteditable`), cette fixture ne modélise que ce
que le constat décrit pour Claude.ai :

- **Composer** : `div.ProseMirror[contenteditable]` dans un `<fieldset>`,
  bouton d'envoi porteur d'un `aria-label` traduit selon la langue de
  l'interface.
- **Piège volontaire** : un deuxième `div.ProseMirror[contenteditable]`
  hors composer (« Renommer la conversation »), pour vérifier qu'un
  adaptateur qualifie bien le champ via son conteneur plutôt que de prendre
  le premier `ProseMirror` trouvé sur la page (voir constat, §2.2, et
  `docs/recherche/reco.md` R-17).
- **Fil de conversation** : tours `.group/conversation-turn`, message
  utilisateur `[data-testid="user-message"]`, message assistant
  `.font-claude-response[data-is-streaming]` avec sa barre d'actions
  (`[data-message-action-bar]`, bouton `[data-testid="action-bar-copy"]`).
  `data-is-streaming` est porté **par le message lui-même** — plus précis
  que le signal générique de `mock-ai-site` (attribut sur toute la zone de
  réponse).

## Contrôles de test

- **FR / EN (aria-label)** : bascule l'`aria-label` du bouton d'envoi entre
  `Send message` et `Envoyer le message`, pour vérifier qu'un sélecteur
  `button[aria-label*="Send" i]` ne casse pas silencieusement en UI
  française (piège documenté dans le constat).
- Panneau replié **🧪 Contrôles de test** : mêmes deux boutons que
  `mock-ai-site` (réception instantanée / streaming), avec le signal de fin
  porté par `data-is-streaming` sur le message plutôt que par un événement
  `fogbank:streaming-end`.

## Utilisation

Identique à [`mock-ai-site/README.md`](../mock-ai-site/README.md) : ouvrir
`index.html` en `file://`, autoriser l'accès aux URL de fichiers pour
l'extension, puis ajouter la page à la whitelist une fois M-01 implémenté.

## Fiabilité

Comme précisé dans le constat source : **aucun sélecteur n'a été vérifié en
direct** contre le vrai `claude.ai`. Rejouer la sonde de validation du
constat (§8) avant d'implémenter `claude.js`, et à chaque changement de
comportement observé.
