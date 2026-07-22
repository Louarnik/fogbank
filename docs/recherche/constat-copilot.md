# Constat — Microsoft Copilot

**Périmètre retenu** : `https://copilot.microsoft.com/*` (Copilot grand public).

**Nature du document** : relevé factuel. Ce que le site *est*, pas ce que fogbank *doit
faire* — les décisions d'implémentation sont dans `reco.md`.

**Méthode et fiabilité** : établi à partir de code open source public (CLI de pilotage,
exporters, clients non officiels) et de documentation, entre janvier et juillet 2026.
**Aucun sélecteur n'a été vérifié en direct.** Copilot change d'interface plus souvent que
les deux autres : exécuter la sonde du §8 avant toute implémentation, puis à chaque release.

---

## 0. « Copilot » désigne quatre produits distincts

| Produit | URL | Nature |
|---|---|---|
| **Copilot grand public** | `copilot.microsoft.com` | SPA React, WebSocket — **objet de ce document** |
| Microsoft 365 Copilot | `m365.cloud.microsoft`, `copilot.cloud.microsoft` | SPA, WebSocket vers `substrate.office.com` — §6 |
| Copilot intégré à Office | Word / Excel / Outlook web | volets et `iframe` imbriqués |
| GitHub Copilot Chat | VS Code, JetBrains | vue web d'éditeur, hors navigateur |

Le nom seul ne désigne rien de précis. Toute mention de « Copilot » dans les specs doit
être qualifiée.

---

## 1. Nature de l'application

SPA React, refondue en 2024 en remplacement de l'ancienne interface Bing Chat.

**Deux générations d'interface coexistent** dans le code des outils tiers, ce qui explique
l'hétérogénéité des sélecteurs relevés :

- **Génération actuelle** : DOM React classique, attributs `data-content`.
- **Génération héritée (Bing Chat)** : Web Components (`cib-serp`, `cib-conversation`,
  `cib-message-group`, `cib-response-container`) avec **Shadow DOM**. Encore présente sur
  certains points d'entrée Bing. `document.querySelector` n'y voit rien : il faut
  traverser les `shadowRoot` récursivement, et un shadow root en mode `closed` reste
  inaccessible.

---

## 2. Zone de saisie

### 2.1 Structure

**C'est un `<textarea>` natif.** Pas de ProseMirror, pas de `contenteditable`, pas de
modèle de document parallèle. C'est le seul des trois sites où l'état affiché est l'état
réel.

### 2.2 Sélecteurs

| Rôle | Sélecteur | Stabilité |
|---|---|---|
| Saisie (grand public) | `textarea[placeholder*="Ask" i]` | moyenne — **traduit** |
| Saisie (M365) | `textarea[placeholder*="Copilot" i]` | moyenne — **traduit** |
| Repli historique | `#userInput` | basse |
| Repli générique | `textarea:not([readonly])` | dernier recours |

Le `placeholder` est traduit (« Poser une question », « Demander à Copilot »…). Aucun
`data-testid` documenté stable n'a été relevé sur le composer, ni sur le bouton d'envoi.

### 2.3 Comportement observé

React instrumente le setter `value` de l'instance (`_valueTracker`). Une affectation
directe `ta.value = x` met le tracker à jour, de sorte que React conclut à l'absence de
changement et **ignore** l'événement `input` qui suit. Passer par le setter du prototype
(`HTMLTextAreaElement.prototype`) court-circuite le tracker et rend le changement visible
à React.

`document.execCommand('insertText')` fonctionne également sur `<textarea>` sous Chromium
et alimente la pile d'annulation native.

**Conséquence factuelle** : sur ce site, lecture *et* écriture par le DOM sont fiables.

---

## 3. Déclenchement de l'envoi

`Enter` sans `shift` dans le `textarea`, ou clic sur le bouton d'envoi. Le bouton n'ayant
pas d'ancre stable relevée, il n'est repérable que par sa position dans le conteneur du
composer ou par `button[type="submit"]`.

---

## 4. Zone de réponse

### 4.1 Sélecteurs — génération actuelle

| Rôle | Sélecteur |
|---|---|
| Message de l'assistant | `div[data-content="ai-message"]` |
| Corps du message | `div[data-content="ai-message"] .group\/ai-message-item` |
| Message générique | `[data-content="chat-message"]` |
| Réponse (variante) | `[data-content="response"]` |
| Auteur = bot | `[data-message-author="bot"]` |

### 4.2 Sélecteurs — génération héritée (Shadow DOM)

| Rôle | Sélecteur |
|---|---|
| Groupe de messages | `cib-message-group[data-source="cib"]` |
| Conteneur de réponse | `cib-response-container` |
| Conteneur de conversation | `.b_sydConvCont` |
| Texte de réponse | `.text-response` |

### 4.3 Détection de la génération en cours

**Aucun attribut équivalent à `data-is-streaming` n'a été relevé.** Les outils tiers
existants procèdent par indices génériques — `[aria-busy="true"]`,
`[data-is-typing="true"]`, `[data-testid="typing-indicator"]` — ou, plus fiablement, par
**stabilité du texte** : réponse considérée terminée après ~2,5 s sans mutation.

---

## 5. Couche réseau

### 5.1 Transport

Contrairement à ChatGPT et Claude, le prompt **ne part pas par `fetch`**.

```
POST  https://copilot.microsoft.com/c/api/conversations        → { id }
WSS   wss://copilot.microsoft.com/c/api/chat?api-version=2&features=…
```

Le prompt part dans une **trame WebSocket JSON**. La réponse revient en trames
incrémentales (une par fragment), suivies d'une trame finale contenant la réponse
complète.

### 5.2 Caractéristiques de l'API WebSocket

- `WebSocket.prototype.send` est **synchrone** — aucune attente asynchrone possible dans
  la méthode elle-même.
- `MessageEvent.data` est en **lecture seule** — une trame reçue ne peut pas être modifiée
  en place.
- Le paramètre `edgepagecontext` observé dans l'URL indique que Copilot dans Edge peut
  transmettre **le contenu de l'onglet actif** au modèle. Ce canal est indépendant du
  prompt.

---

## 6. Microsoft 365 Copilot — relevé séparé

Backend distinct : `https://substrate.office.com/m365Copilot/…`, endpoints `GetChats`,
`GetConversation`, `DeleteConversation`. Jeton d'accès d'audience
`https://substrate.office.com/sydney`, stocké dans le `localStorage` du domaine hôte
(`outlook.office.com`, `teams.microsoft.com`, selon le point d'entrée). Le dialogue passe
également par WebSocket.

Trois caractéristiques structurantes :

- **Points d'entrée multiples** : Teams, Outlook, Word, portail M365 — souvent dans une
  `iframe`, parfois cross-origin.
- **Domaines variables** : `m365.cloud.microsoft`, `copilot.cloud.microsoft`,
  `www.office.com`.
- **Corpus tenant** : Copilot interroge les documents, mails et messages de l'utilisateur.
  Le prompt n'est qu'une petite partie de ce qui est traité.

---

## 7. Ce qui a été observé stable / instable

| Stabilité | Éléments |
|---|---|
| Haute | nature `<textarea>` du composer, transport WebSocket, chemin `/c/api/chat` |
| Moyenne | `div[data-content="ai-message"]`, `[data-message-author="bot"]` |
| Basse | `placeholder` (langue), `.group\/ai-message-item`, `#userInput`, tout ce qui relève de la génération héritée |

Rythme de refonte de l'interface nettement supérieur à celui de ChatGPT et Claude.

---

## 8. Sonde de validation

À exécuter dans la console de `copilot.microsoft.com`, une conversation ouverte.

```js
(() => {
  const partout = (sel, racine = document) => {
    const r = [...racine.querySelectorAll(sel)];
    for (const el of racine.querySelectorAll('*'))
      if (el.shadowRoot) r.push(...partout(sel, el.shadowRoot));
    return r;
  };
  const t = [
    ['saisie (Ask)',        'textarea[placeholder*="Ask" i]'],
    ['saisie (Copilot)',    'textarea[placeholder*="Copilot" i]'],
    ['saisie (#userInput)', '#userInput'],
    ['saisie (tous)',       'textarea:not([readonly])'],
    ['msg assistant',       'div[data-content="ai-message"]'],
    ['corps du message',    'div[data-content="ai-message"] .group\\/ai-message-item'],
    ['message générique',   '[data-content="chat-message"]'],
    ['auteur = bot',        '[data-message-author="bot"]'],
    ['hérité : groupe',     'cib-message-group'],
    ['hérité : réponse',    'cib-response-container'],
  ];
  console.table(t.map(([r, s]) => ({
    role: r, dom: document.querySelectorAll(s).length,
    'dom+shadow': partout(s).length, selecteur: s
  })));
  console.log('éléments porteurs d\'un shadowRoot ouvert :',
              [...document.querySelectorAll('*')].filter(e => e.shadowRoot).length);

  const natif = window.WebSocket;
  window.WebSocket = function (...a) { console.log('[sonde] WS →', a[0]); return new natif(...a); };
  window.WebSocket.prototype = natif.prototype;
  console.log('Sonde WebSocket posée — envoyer un message et observer.');
})();
```

---

## 9. Sources

- `nobodyzxc/m365-copilot-cli` — sélecteurs de saisie et de réponse, sondes de repli,
  détection par stabilité du texte
- `ganyuke/copilot-exporter` — endpoints `substrate.office.com/m365Copilot/*`, audience
  du jeton
- Clients non officiels Copilot / Bing Chat — `POST /c/api/conversations`,
  `wss://…/c/api/chat`
- `Leks2000/Promptory` — sélecteurs de saisie par domaine
