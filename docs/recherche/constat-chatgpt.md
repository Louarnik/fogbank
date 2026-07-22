# Constat — ChatGPT

**Périmètre** : `https://chatgpt.com/*` (ancien domaine `https://chat.openai.com/*`,
toujours redirigé).

**Nature du document** : relevé factuel. Ce que le site *est*, pas ce que fogbank *doit
faire* — les décisions d'implémentation sont dans `reco.md`.

**Méthode et fiabilité** : établi à partir de code open source public (userscripts,
exporters, clients non officiels) et de documentation, entre janvier et juillet 2026.
**Aucun sélecteur n'a été vérifié en direct.** Un DOM de SPA commerciale se périme en
quelques mois : exécuter la sonde du §8 avant toute implémentation, puis à chaque release.

---

## 1. Nature de l'application

React / Next.js, mono-page. La navigation entre conversations passe par
`history.pushState` : le document n'est jamais rechargé. Un `DOMContentLoaded` ne suffit
donc pas à détecter un changement de contexte.

Le rendu est piloté par le virtual DOM. Toute mutation manuelle du texte affiché est
susceptible d'être écrasée au prochain rendu du composant concerné.

---

## 2. Zone de saisie

### 2.1 Structure

Le composer n'est pas un `<textarea>`. C'est un éditeur riche **ProseMirror** dans un
`div[contenteditable]`. L'ancien `textarea#prompt-textarea` a disparu vers septembre 2024,
mais **l'`id` a été conservé sur le nouvel élément** — ce qui fait qu'un grand nombre de
scripts anciens semblent à jour alors qu'ils ciblent un élément de nature différente.

```html
<form>
  <div class="_prosemirror-parent_xxxxx_2">          <!-- classe CSS-module hachée -->
    <div id="prompt-textarea"
         class="ProseMirror"
         contenteditable="true"
         translate="no"
         data-virtualkeyboard="true">
      <p data-placeholder="Ask anything"><br class="ProseMirror-trailingBreak"></p>
    </div>
  </div>
  <button id="composer-submit-button" data-testid="send-button" aria-label="Send prompt">
</form>
```

### 2.2 Sélecteurs

| Rôle | Sélecteur | Stabilité |
|---|---|---|
| Champ de saisie | `#prompt-textarea` | haute — `id` en place depuis 2023 |
| Idem, qualifié | `#prompt-textarea.ProseMirror[contenteditable="true"]` | haute |
| Repli historique | `textarea[name="prompt-textarea"]` | anciennes UI / mode dégradé |
| Parent du composer | `div[class^="_prosemirror-parent_"]` | **basse** — hachage de build |
| Bouton envoyer | `#composer-submit-button[data-testid="send-button"]` | haute |
| Bouton stop | `#composer-submit-button[data-testid="stop-button"]` | haute |

Le même `#composer-submit-button` bascule entre `send-button` et `stop-button` selon
l'état. C'est l'indicateur de génération en cours le plus fiable côté DOM.

### 2.3 Comportement observé de ProseMirror

ProseMirror maintient un modèle de document interne. Les écritures DOM ne le traversent
pas :

```js
input.textContent = 'texte';
input.dispatchEvent(new Event('input', { bubbles: true }));
// L'affichage peut changer brièvement, puis ProseMirror re-rend SON état.
// C'est cet état — non modifié — qui part sur le réseau.
```

Le seul mécanisme observé qui met à jour l'état interne est `document.execCommand('insertText')`,
qui émet un `beforeinput` natif traité par l'éditeur comme une frappe réelle. `execCommand`
est officiellement déprécié et sans remplacement à ce jour.

**Conséquence factuelle** : sur ce site, la lecture du texte via le DOM est fiable,
l'écriture ne l'est pas.

---

## 3. Déclenchement de l'envoi

Deux chemins :

1. `keydown` sur `#prompt-textarea`, `key === 'Enter'` sans `shiftKey`. Pendant une
   composition IME, `e.isComposing === true`.
2. `click` sur `#composer-submit-button`.

Les écouteurs React sont attachés en phase de bouillonnement ; un écouteur en phase de
capture sur `document` passe avant eux.

---

## 4. Zone de réponse

### 4.1 Structure

```html
<div id="thread">
  <article data-testid="conversation-turn-2" data-scroll-anchor="true">
    <div data-message-id="…" data-message-author-role="user">…</div>
  </article>
  <article data-testid="conversation-turn-3">
    <div data-message-id="…" data-message-author-role="assistant"
         data-message-model-slug="…">
      <div class="markdown prose">…contenu rendu…</div>
    </div>
  </article>
</div>
```

### 4.2 Sélecteurs

| Rôle | Sélecteur |
|---|---|
| Conteneur du fil | `#thread` |
| Tour de conversation | `[data-testid^="conversation-turn-"]` |
| Tous les messages | `[data-message-id]` |
| Message utilisateur | `[data-message-author-role="user"]` |
| Message assistant | `[data-message-author-role="assistant"]` |
| Corps rendu | `.markdown` (dans le message assistant) |
| Génération en cours | présence de `[data-testid="stop-button"]` |

`data-message-author-role` est le sélecteur le plus durable du site — présent depuis 2023
et repris par tous les exporters.

### 4.3 Comportement du flux

Le texte arrive par fragments. Une chaîne délimitée peut être scindée entre deux
mutations DOM. Les blocs de code sont rendus par **CodeMirror**, avec virtualisation :
seules les lignes visibles existent dans le DOM à un instant donné.

---

## 5. Couche réseau

### 5.1 Envoi

```
POST https://chatgpt.com/backend-api/conversation
Content-Type: application/json
```

```jsonc
{
  "action": "next",
  "messages": [{
    "id": "…uuid…",
    "author": { "role": "user" },
    "content": { "content_type": "text", "parts": ["LE TEXTE DU PROMPT"] }
  }],
  "parent_message_id": "…",
  "model": "…",
  "conversation_id": "…"          // absent au premier message
}
```

Le texte du prompt est dans `messages[].content.parts[]`, un tableau de chaînes.
Variantes observées : chemin `/backend-api/f/conversation` derrière une protection
anti-bot ; `content_type: "multimodal_text"` avec des objets dans `parts[]` pour les
images.

### 5.2 Réception

Server-Sent Events. Les deltas circulent sous forme d'opérations de patch JSON :

```
data: {"p": "/message/content/parts/0", "o": "append", "v": "texte incrémental"}
```

Le texte se trouve dans les champs `v`.

### 5.3 Rechargement de l'historique

```
GET /backend-api/conversation/{id}                 → arbre complet des messages
GET /backend-api/conversations?offset=&limit=      → titres de la barre latérale
```

Ces réponses contiennent le texte tel qu'il a été envoyé au serveur.

---

## 6. Contraintes propres au site

- **Protection anti-automatisation.** OpenAI applique des contrôles côté requête (en-têtes
  dérivés, jetons de défi). Le corps n'y participe pas ; l'ordre des requêtes et les
  en-têtes, si.
- **Classes CSS-modules hachées** (`_prosemirror-parent_38p30_2`) : changent à chaque build.
- **Trusted Types.** Politique CSP restreignant les affectations de type script ;
  `innerHTML` sur un nœud injecté peut être refusé.
- **Points d'entrée multiples** : `/c/…` (conversation), `/g/…` (GPT personnalisé),
  `/gpts/…`, projets. Composer et fil identiques dans tous les cas.
- **Caractère `@`** : déclenche le menu natif des GPTs personnalisés. **`/`** : commandes
  slash. C'est ce qui motivait ADR-001.

---

## 7. Ce qui a été observé stable / instable

| Stabilité | Éléments |
|---|---|
| Haute | `#prompt-textarea`, `#thread`, `data-message-author-role`, `data-message-id`, `data-testid="conversation-turn-*"`, `/backend-api/conversation` |
| Moyenne | `data-testid="send-button"` / `"stop-button"`, `.markdown` |
| Basse | toute classe préfixée `_` avec suffixe haché, structure interne des `<article>` |

---

## 8. Sonde de validation

À exécuter dans la console de `chatgpt.com`, une conversation ouverte.

```js
(() => {
  const t = [
    ['saisie',            '#prompt-textarea'],
    ['saisie (qualifié)', '#prompt-textarea.ProseMirror[contenteditable="true"]'],
    ['bouton envoyer',    '#composer-submit-button'],
    ['fil',               '#thread'],
    ['tours',             '[data-testid^="conversation-turn-"]'],
    ['messages',          '[data-message-id]'],
    ['msg utilisateur',   '[data-message-author-role="user"]'],
    ['msg assistant',     '[data-message-author-role="assistant"]'],
    ['corps rendu',       '[data-message-author-role="assistant"] .markdown'],
  ];
  console.table(t.map(([r, s]) => ({
    role: r, ok: document.querySelectorAll(s).length > 0,
    n: document.querySelectorAll(s).length, selecteur: s
  })));
  const i = document.querySelector('#prompt-textarea');
  console.log('éditeur =', i?.tagName,
              '| contenteditable =', i?.isContentEditable,
              '| ProseMirror =', i?.classList.contains('ProseMirror'));
})();
```

Puis onglet Réseau, filtre `conversation` : envoyer un message et confirmer le chemin
`messages[0].content.parts[0]` dans la charge utile.

---

## 9. Sources

- `pionxzh/chatgpt-exporter` — `#thread`, `[data-testid^="conversation-turn-"]`,
  `[data-message-id]`, `/backend-api`
- `DREwX-code/omnichat-exporter` — adaptateurs multi-sites
- `alberti42/chatGPT-plain-composer` — contournement du composer ProseMirror
- `Leks2000/Promptory` — sélecteurs de saisie par domaine
- Fils publics sur l'insertion programmatique dans ProseMirror
