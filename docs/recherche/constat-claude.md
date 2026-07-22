# Constat — Claude.ai

**Périmètre** : `https://claude.ai/*`.

**Nature du document** : relevé factuel. Ce que le site *est*, pas ce que fogbank *doit
faire* — les décisions d'implémentation sont dans `reco.md`.

**Méthode et fiabilité** : établi à partir de code open source public (userscripts,
exporters, clients non officiels) et de documentation, entre janvier et juillet 2026.
**Aucun sélecteur n'a été vérifié en direct.** Exécuter la sonde du §8 avant toute
implémentation, puis à chaque release.

---

## 1. Nature de l'application

React, mono-page. Routes : `/new`, `/chat/{uuid}`, `/project/{uuid}`, `/recents`.
Navigation par `pushState`, jamais de rechargement complet.

Structurellement, c'est le site le plus proche de ChatGPT des trois : même famille
d'éditeur (ProseMirror), même transport (`fetch` + SSE). Les différences portent sur le
nommage des sélecteurs et la forme du payload.

---

## 2. Zone de saisie

### 2.1 Structure

Éditeur **ProseMirror** dans un `div[contenteditable]`, à l'intérieur d'un `fieldset` qui
porte aussi les boutons de pièce jointe et de modèle. **Pas d'`id` stable** équivalent au
`#prompt-textarea` de ChatGPT.

```html
<fieldset>
  <div class="…">
    <div contenteditable="true"
         class="ProseMirror"
         translate="no"
         enterkeyhint="enter"
         aria-label="Write your prompt to Claude">
      <p data-placeholder="How can I help you today?"><br></p>
    </div>
  </div>
  <button aria-label="Send message">…</button>
</fieldset>
```

### 2.2 Sélecteurs

| Rôle | Sélecteur | Stabilité |
|---|---|---|
| Champ de saisie | `div.ProseMirror[contenteditable="true"]` | haute |
| Repli 1 | `div[contenteditable="true"][data-placeholder]` | moyenne |
| Repli 2 | `div[contenteditable="true"][role="textbox"]` | moyenne |
| Placeholder | `p[data-placeholder]` | moyenne |
| Bouton envoyer | `button[aria-label*="Send" i]` | moyenne — **traduit** |

Deux points relevés :

- Les `aria-label` sont **traduits selon la langue de l'interface** (« Envoyer le message »
  en français). Une correspondance exacte sur une chaîne anglaise échoue silencieusement
  hors UI anglaise.
- `div.ProseMirror[contenteditable="true"]` **peut correspondre à plusieurs éléments** :
  le composer, mais aussi l'éditeur ouvert lors du renommage d'une conversation ou de
  l'édition d'un message précédent.

### 2.3 Comportement observé de ProseMirror

Identique à ChatGPT : les écritures DOM (`textContent`, `innerHTML`) ne modifient pas le
modèle interne ; l'état ProseMirror, inchangé, est ce qui part sur le réseau. Seul
`document.execCommand('insertText')` produit un `beforeinput` que l'éditeur accepte.

Lecture par le DOM : fiable. Écriture : non.

---

## 3. Déclenchement de l'envoi

- `Enter` sans `shift` par défaut. **L'utilisateur peut inverser ce comportement dans les
  réglages** — il ne peut pas être supposé.
- `click` sur le bouton d'envoi du composer.

---

## 4. Zone de réponse

### 4.1 Structure

```html
<div class="group/conversation-turn">
  <div data-testid="user-message">…texte utilisateur…</div>
</div>
<div class="group/conversation-turn">
  <div class="font-claude-response" data-is-streaming="true|false">
    <div data-message-action-bar>
      <button data-testid="action-bar-copy">…</button>
    </div>
    …contenu rendu…
  </div>
</div>
```

### 4.2 Sélecteurs

| Rôle | Sélecteur |
|---|---|
| Tour de conversation | `.group\/conversation-turn` (barre à échapper en CSS) |
| Message utilisateur | `[data-testid="user-message"]` |
| Message assistant | `.font-claude-response` |
| Variante observée | `[data-testid="assistant-message"]` |
| Barre d'actions | `[data-message-action-bar]` |
| Bouton copier | `[data-testid="action-bar-copy"]` |
| Actions d'en-tête / partage | `[data-testid="wiggle-controls-actions"]` |
| Génération en cours | `[data-is-streaming="true"]` — **à confirmer par la sonde** |

`[data-testid="user-message"]` et `.font-claude-response` sont les deux ancres reprises
par tous les exporters multi-sites. `.font-claude-response` reste une classe utilitaire,
donc de stabilité moyenne.

`data-is-streaming`, s'il est confirmé, est porté **par le message lui-même** — donc plus
précis que l'équivalent ChatGPT, qui indique seulement qu'une génération est en cours
quelque part.

### 4.3 Contenus rendus hors du fil

- **Artefacts** : rendus dans un panneau latéral distinct, souvent en CodeMirror, parfois
  dans une `iframe` sandboxée. Non atteignables depuis le fil.
- **Extended thinking** : bloc repliable séparé, alimenté par le même flux.

---

## 5. Couche réseau

### 5.1 Envoi

```
POST https://claude.ai/api/organizations/{organizationUuid}/chat_conversations/{conversationUuid}/completion
Content-Type: application/json
Accept: text/event-stream
```

```jsonc
{
  "prompt": "LE TEXTE DU PROMPT",
  "parent_message_uuid": "…",
  "timezone": "Europe/Paris",
  "attachments": [],
  "files": [],
  "personalized_styles": [ … ],
  "rendering_mode": "messages"
}
```

Le texte est dans le champ `prompt`, à plat. Les deux UUID sont dans l'URL. Le schéma du
corps évolue plus vite que celui de ChatGPT.

### 5.2 Réception

Server-Sent Events, événements de type `completion` / `content_block_delta`, texte
incrémental dans un champ JSON.

### 5.3 Rechargement de l'historique

```
GET /api/organizations/{org}/chat_conversations/{uuid}?tree=True&rendering_mode=messages
GET /api/organizations/{org}/chat_conversations                → liste et titres
```

### 5.4 Note sur l'accès à cette API

Anthropic a par le passé restreint l'accès non navigateur à cette API interne : des
clients non officiels sont devenus inopérants. Le fait est mentionné pour mémoire ; il
concerne les clients qui émettent leurs propres requêtes, pas un code qui s'exécute dans
la page et se contente de lire ou réécrire une requête émise par le site lui-même.

---

## 6. Contraintes propres au site

- **Absence d'ancre stable sur la saisie** : ni `id`, ni `data-testid` documenté. Le
  sélecteur doit être qualifié par le conteneur du composer.
- **Éditeurs multiples** simultanément présents (composer, renommage, édition d'un message).
- **Libellés traduits** : rien de la logique ne peut reposer sur un `aria-label`.
- **Projets** : le contenu des « connaissances du projet » est transmis côté serveur en
  dehors du flux de prompt.
- **Trusted Types / CSP** : `innerHTML` sur un nœud injecté peut être refusé.
- **Caractère `@`** : référencement des fichiers de projet. **`/`** : commandes. C'est ce
  qui motivait ADR-001.

---

## 7. Ce qui a été observé stable / instable

| Stabilité | Éléments |
|---|---|
| Haute | `[data-testid="user-message"]`, `div.ProseMirror[contenteditable]`, chemin `/completion` |
| Moyenne | `.font-claude-response`, `[data-message-action-bar]`, `data-is-streaming` |
| Basse | `aria-label` (langue), classes utilitaires Tailwind, schéma exact du corps JSON |

---

## 8. Sonde de validation

À exécuter dans la console de `claude.ai`, une conversation ouverte comportant au moins un
échange.

```js
(() => {
  const t = [
    ['saisie (ProseMirror)', 'div.ProseMirror[contenteditable="true"]'],
    ['saisie (repli)',       'div[contenteditable="true"][data-placeholder]'],
    ['placeholder',          'p[data-placeholder]'],
    ['bouton envoyer',       'button[aria-label*="Send" i], button[aria-label*="Envoyer" i]'],
    ['tour de conversation', '.group\\/conversation-turn'],
    ['msg utilisateur',      '[data-testid="user-message"]'],
    ['msg assistant',        '.font-claude-response'],
    ['msg assistant (alt)',  '[data-testid="assistant-message"]'],
    ['barre d\'actions',     '[data-message-action-bar]'],
    ['streaming',            '[data-is-streaming]'],
  ];
  console.table(t.map(([r, s]) => ({
    role: r, ok: document.querySelectorAll(s).length > 0,
    n: document.querySelectorAll(s).length, selecteur: s
  })));
  const eds = document.querySelectorAll('div.ProseMirror[contenteditable="true"]');
  console.log('éditeurs ProseMirror présents :', eds.length,
              '— si > 1, qualifier par le conteneur du composer');
  console.log('Test manuel : taper « & » dans le composer, vérifier qu\'aucun menu natif n\'apparaît.');
})();
```

Puis onglet Réseau, filtre `completion` : envoyer un message et confirmer la présence du
champ `prompt` et la forme de l'URL.

---

## 9. Sources

- `DREwX-code/omnichat-exporter` — `[data-testid="user-message"]`, `.font-claude-response`,
  `[data-message-action-bar]`, `[data-testid="wiggle-controls-actions"]`
- Userscripts publics claude.ai (horodatage des messages, raccourcis d'envoi)
- `Leks2000/Promptory` — sélecteurs de saisie par domaine
- `Explosion-Scratch/claude-unofficial-api` — forme de l'API interne (historique)
