# fogbank — Recommandations d'implémentation

**Nature du document** : ce que fogbank doit faire. Les relevés factuels par site sont
dans `constat-chatgpt.md`, `constat-claude.md`, `constat-copilot.md`.

**Numérotation refondue** en une série unique `R-01`…`R-63`, référençable depuis les UC.

---

## 0. Décisions actées

| | Décision |
|---|---|
| **Mode** | **Fail-closed** : le tag `[TYP:CODE]` est ce que l'utilisateur saisit et voit dans le champ. Le vrai nom n'entre jamais dans l'éditeur. → *ADR-007 à rédiger* |
| **Périmètre** | ChatGPT, Claude.ai, **Copilot grand public maintenu**. M365 Copilot laissé ouvert et distinct. |
| **M-06** | Redéfini : détection des vrais noms restés en clair + garde-fou bloquant à l'envoi. Plus aucune substitution silencieuse. |
| **Affichage** | Décoration seule (soulignement + infobulle + légende), jamais de substitution visuelle. |
| **Cloisonnement** | Toute la couche d'affichage dans un shadow root fermé. |

### Ce que le mode fail-closed a fait disparaître

1. **La couche réseau sortante.** Le champ contient déjà le pseudonyme : plus de hook
   `fetch` à l'aller, plus de schéma de payload à connaître par site.
2. **Le problème ProseMirror.** On ne réécrit plus le contenu de l'éditeur juste avant
   l'envoi ; il ne reste qu'une insertion déclenchée par un geste utilisateur.
3. **Le `send()` synchrone de Copilot.** C'était le seul obstacle sérieux à couvrir
   Copilot. C'est ce qui permet de le garder.

**Le périmètre réseau se réduit à la réception.**

---

## A. Socle technique

### Ce que le navigateur permet

- **Manifest V3** : `webRequest` bloquant supprimé. `declarativeNetRequest` peut bloquer
  ou rediriger, mais **ne peut ni lire ni modifier un corps** de requête ou de réponse.
  Un content script en **monde `MAIN`** est la seule voie pour intercepter un flux.
- **Mondes d'exécution** : un content script tourne par défaut en monde `ISOLATED`. Il
  partage le **DOM** avec la page, mais dispose de sa **propre copie des objets natifs**
  (`Element`, `Object`, prototypes). Un patch de prototype posé par la page ne l'atteint
  pas.
- **Service worker** : s'arrête à tout moment. `chrome.storage.local` fait foi (ADR-005) ;
  rien ne persiste en mémoire vive côté background.
- **Trusted Types** : ces trois sites appliquent des politiques CSP susceptibles de
  refuser une affectation `innerHTML` sur un nœud injecté.

### Recommandations

**R-01. Le monde `MAIN` ne transporte que du texte, jamais l'annuaire.** Tout objet posé
en monde `MAIN` est lisible par la page. Un annuaire vrai nom ↔ pseudonyme y serait,
littéralement, la fuite de tout ce que fogbank protège, sur le site même dont on se méfie.
Le hook reçoit du texte, le fait résoudre par le monde `ISOLATED` via `postMessage`,
poursuit. Le pont se referme sur une closure, ne s'attache pas à `window`, et vérifie
`e.source === window` **et** l'origine sur chaque message.

**R-02. `run_at: "document_start"` pour tout hook réseau**, sans quoi le bundle du site
capture sa propre référence à `fetch` avant nous.

**R-03. Sites optionnels par `optional_host_permissions`** (cohérent ADR-004) + 
`chrome.permissions.request()` appelé **depuis un geste utilisateur** dans la page
d'options, puis `chrome.scripting.registerContentScripts({ …, world: 'MAIN' })` depuis le
service worker.

---

## B. Architecture des adaptateurs

**R-04. Un fichier par site dans `src/content/site-adapters/`**, contrat unique :

```js
export const chatgpt = {
  id: 'chatgpt',
  matches: (url) => /^https:\/\/chatgpt\.com\//.test(url),

  // --- saisie
  inputKind: 'contenteditable',                 // 'textarea' | 'contenteditable'
  getComposer:   () => document.querySelector('form:has(#prompt-textarea)'),
  getInputField: () => document.querySelector('#prompt-textarea'),
  getSendTrigger:() => document.querySelector('#composer-submit-button'),

  // --- réponse
  getResponseContainer: () => document.querySelector('#thread'),
  getMessageNodes: (r) => r.querySelectorAll('[data-message-author-role]'),
  isStreaming: () => !!document.querySelector('[data-testid="stop-button"]'),

  // --- réception réseau (M-07 uniquement)
  transport: 'fetch',                           // 'fetch' | 'websocket' | null
  matchRecv: (url) => /\/backend-api\/(f\/)?conversation/.test(url),
};
```

**R-05. `inputKind` est déclaré, jamais deviné à l'exécution.** Si un site change de type
d'éditeur, ce doit être une ligne à modifier dans l'adaptateur, pas un débogage de la
couche générique.

**R-06. Plus de `extractPrompt` / `injectPrompt`.** Conséquence directe du fail-closed :
aucune réécriture sortante.

**R-07. `generic.js` n'implémente que la moitié DOM** et l'UI l'annonce explicitement :
*« sur ce site, fogbank ne garantit pas la restauration »*.

---

## C. Saisie — la façade `EditorHandle`

**R-08. Ne jamais écrire de code fogbank contre l'élément brut.** Trois familles de champs
coexistent (`<textarea>` sur Copilot, ProseMirror sur ChatGPT et Claude, `<input>` en
marge). Tout passe par une façade :

```js
/**
 * @typedef {Object} EditorHandle
 * @property {() => string}                              getText
 * @property {() => {debut:number, fin:number}}          getSelection
 * @property {(d:number, f:number) => void}              setSelection
 * @property {(d:number, f:number, t:string) => boolean} replaceRange
 * @property {(offset:number) => DOMRect}                getCaretRect
 * @property {(d:number, f:number) => DOMRect[]}         getRangeRects
 * @property {(cb:() => void) => () => void}             onInput
 */
```

**R-09. Deux implémentations seulement** : `TextareaHandle` et `ContentEditableHandle`.
`<input type="text">` réutilise la première.

**R-10. Une primitive d'écriture unique : `document.execCommand('insertText')`.** Elle
fonctionne sur `<textarea>`, `<input>` **et** `contenteditable` sous Chromium, émet un
`beforeinput` natif accepté par React comme par ProseMirror, et **conserve la pile
d'annulation** — `Ctrl+Z` défait proprement l'insertion du tag. Dépréciée, sans
remplacement.

```js
replaceRange(debut, fin, texte) {
  champ.focus();
  handle.setSelection(debut, fin);
  return document.execCommand('insertText', false, texte) || repli(debut, fin, texte);
}
```

**R-11. Repli sur `<textarea>` : passer par le setter du *prototype*.** React instrumente
le `value` de l'instance ; une affectation directe met son tracker à jour, React conclut à
l'absence de changement et ignore l'`input` qui suit.

```js
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype, 'value').set;
setter.call(ta, v.slice(0, debut) + texte + v.slice(fin));
ta.setSelectionRange(debut + texte.length, debut + texte.length);
ta.dispatchEvent(new Event('input', { bubbles: true }));
```

**R-12. Ne pas faire de `setRangeText()` la voie principale** : ne passe pas par le
tracker React, n'alimente pas la pile d'annulation.

**R-13. Neutraliser pendant la composition IME.** Si `e.isComposing`, ne rien faire ;
réagir à `compositionend`. Sinon le menu `&` se déclenche en pleine saisie
japonaise/chinoise/coréenne, et une insertion programmatique corrompt le tampon.

**R-14. Vérifier `maxlength` avant insertion** — un tag n'a pas la longueur du texte
qu'il remplace.

**R-15. Brancher la détection sur `input`, pas sur `keyup`** : couvre d'un coup la frappe,
le collage et le glisser-déposer de texte.

**R-16. Re-résoudre le champ à chaque changement de route.** Les trois sites sont des SPA
et remplacent leur composer. Surveiller `pushState`/`replaceState` ou observer le
conteneur du composer.

**R-17. Toujours qualifier le champ par son conteneur.** Sur Claude, plusieurs
`div.ProseMirror[contenteditable]` coexistent (composer, renommage, édition d'un message
antérieur). Utiliser `getComposer()` puis descendre, ou se fier à `document.activeElement`.

**R-18. Gérer le Shadow DOM sur Copilot.** Si le champ est dans un `shadowRoot`,
`document.activeElement` renvoie l'hôte : utiliser `champ.getRootNode().activeElement` ou
`event.composedPath()[0]`.

---

## D. `<textarea>` — mesure

Un `<textarea>` n'expose aucun nœud DOM pour son contenu : ni `Range`, ni
`getClientRects()`. Les coordonnées se reconstruisent par un **miroir**.

**R-19. Un seul miroir, deux usages** : position du curseur (ancrage du menu `&`) et
rectangles des tags (soulignement + survol). Ne pas en maintenir deux.

**R-20. Copier exhaustivement les propriétés calculées.** Un oubli décale tout le texte en
aval :

```
box-sizing, width, height,
padding-{top,right,bottom,left}, border-{top,right,bottom,left}-width,
font-family, font-size, font-weight, font-style, font-variant,
letter-spacing, word-spacing, line-height, tab-size,
text-transform, text-indent, text-rendering,
white-space: pre-wrap, overflow-wrap: break-word, direction
```

Plus, sur le miroir : `position:absolute`, `overflow:hidden`, et `visibility:hidden` pour
l'usage « position du curseur ».

**R-21. Quirk de la dernière ligne** : si `value` se termine par `\n`, la dernière ligne du
miroir est collapsée. Ajouter un caractère de garde (`​`).

**R-22. Position du curseur.**

```js
function rectCurseur(ta, offset) {
  const m = miroir(ta);
  m.textContent = ta.value.slice(0, offset);
  const repere = document.createElement('span');
  repere.textContent = ta.value.slice(offset) || '.';
  m.appendChild(repere);
  const r = ta.getBoundingClientRect();
  return new DOMRect(
    r.left + repere.offsetLeft - ta.scrollLeft,
    r.top  + repere.offsetTop  - ta.scrollTop,
    0, parseFloat(getComputedStyle(ta).lineHeight));
}
```

**R-23. `getRangeRects()` produit les rectangles de chaque tag** en enveloppant les plages
dans des `<span>` du miroir et en lisant leurs `getClientRects()`. Ces rectangles servent
au soulignement **et** au survol (R-36) : les calculer une fois par frappe.

**R-24. Resynchroniser sur `scroll` (les deux axes), `ResizeObserver`** (les `<textarea>`
sont redimensionnables et auto-agrandissants) **et `document.fonts.ready`**.

Sur `contenteditable`, `getRangeRects()` devient trivial via `Range.getClientRects()` :
aucun miroir n'est nécessaire.

---

## E. Couche d'affichage

### E.1 Cloisonnement

**R-25. Une seule racine fantôme fermée, accrochée à `document.documentElement`,
créée depuis le monde `ISOLATED`.** Elle contient le miroir de mesure, le calque de
soulignement, l'infobulle et le panneau de légende.

```js
const racine = (() => {
  const hote = document.createElement('div');
  hote.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
  document.documentElement.appendChild(hote);
  return hote.attachShadow({ mode: 'closed' });   // référence captive
})();
```

**R-26. Motif.** fogbank doit *afficher* le vrai nom sans le *déposer* dans le DOM du site.
Un outil de rejeu de session (FullStory, Clarity, Hotjar, `rrweb`…) ne filme pas l'écran :
il sérialise le DOM puis transmet chaque mutation à ses serveurs. **Tout nœud du document
est capté, y compris ceux injectés par une extension** ; les mécanismes de masquage
(`data-hj-suppress`, `.fs-exclude`) sont déclarés par le site sur ses propres éléments.
Un shadow root fermé n'apparaît ni dans la sérialisation, ni dans le flux de mutations —
et `hote.shadowRoot` renvoie `null`. La technique d'interception par patch de
`attachShadow` ne s'applique pas ici : le monde `ISOLATED` a ses propres prototypes.
Cela vaut autant contre les **autres extensions** de l'utilisateur, vecteur plus probable.

Ce que cela ne couvre pas : capture d'écran, partage d'écran, DevTools, extension avec la
permission `debugger`. Le DOM est protégé, pas les pixels.

**R-27. Hôte anodin** : ni `id="fogbank"`, ni `class="fogbank-layer"`. Un outil de
confidentialité n'a pas à signaler sa présence au site qu'il surveille. Aucun attribut, ou
identifiant tiré aléatoirement par session.

**R-28. Aucune ressource externe dans la racine.** Pas de `chrome.runtime.getURL()` pour
une police ou une icône : une URL `chrome-extension://<id>/` révèle l'identifiant de
l'extension. Polices système, SVG en ligne, CSS en dur.

**R-29. Styles par `adoptedStyleSheets`**, pas un `<style>` dupliqué.

**R-30. `pointer-events: none` sur toute la couche.** Sinon un clic destiné à placer le
curseur atterrit dessus.

> **Effet de bord favorable** : fogbank n'insère plus rien dans le DOM du site, nulle part
> — un seul `<div>` hôte vide. Le calque n'a plus besoin d'être co-localisé avec le champ
> (le miroir copie explicitement les métriques, R-20) ni placé *derrière* lui (il ne peint
> que des traits sous la ligne de base). Bonus : isolation CSS totale, les feuilles
> Tailwind du site ne peuvent plus écraser les styles de fogbank.

### E.2 Règle cardinale

**R-31. Décorer, jamais substituer à l'affichage.** Afficher « Pierre Dupont » là où le
champ contient `[PER:PDT]` casse la position du curseur, les points de césure, les
rectangles de sélection et la navigation au clavier : les longueurs diffèrent. Vaut pour
les deux types de champ. Le calque ne peut que peindre par-dessus le texte réel.

**R-32. Un `<mark>` ne porte que de la peinture.** `background`, `box-shadow`, `outline`,
`text-decoration`. **Interdits absolus** : `padding`, `margin`, `border`, `font-*`,
`letter-spacing`, `text-transform` — toute propriété modifiant les métriques décale les
glyphes suivants.

**R-33. Le calque est au-dessus, texte en `color: transparent`.** Les glyphes visibles
restent ceux du champ ; on ne dessine que les traits.

```css
.fb-calque      { color: transparent; pointer-events: none; }
.fb-calque mark { color: transparent; background: transparent;
                  box-shadow: inset 0 -2px 0 0 var(--fb-trait); }
```

### E.3 Infobulle

**R-34. Verre dépoli, pas simple transparence.** Une infobulle semi-transparente posée
au-dessus d'un texte se lit mal : le contraste dépend du fond, et le fond est du texte.
Alpha **plus** `backdrop-filter: blur()` — le flou détruit la structure du fond en
préservant sa couleur. Repli opaque obligatoire.

```css
.fb-bulle{
  position: fixed; max-width: 20rem; padding: .5rem .625rem; border-radius: .5rem;
  font: 500 12.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  pointer-events: none; opacity: 0; transform: translateY(2px);
  transition: opacity .12s ease, transform .12s ease;
  color: #f4f4f5; background: rgba(24,24,27,.72);
  border: 1px solid rgba(255,255,255,.14); box-shadow: 0 6px 24px rgba(0,0,0,.35);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
          backdrop-filter: blur(14px) saturate(160%);
}
.fb-bulle[data-ouvert]{ opacity: 1; transform: none; }
.fb-bulle[data-theme="clair"]{
  color:#18181b; background:rgba(255,255,255,.74);
  border-color:rgba(0,0,0,.10); box-shadow:0 6px 24px rgba(0,0,0,.14);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))){
  .fb-bulle{ background: rgba(24,24,27,.96); }
  .fb-bulle[data-theme="clair"]{ background: rgba(255,255,255,.97); }
}
```

**R-35. Détecter le thème du site, pas celui du système.** Ces applications ont leur propre
bascule clair/sombre, qui ne suit pas toujours l'OS. Remonter les ancêtres du champ
jusqu'à un fond non transparent et calculer sa luminance
(`0.2126·R + 0.7152·V + 0.0722·B`), une fois par changement de route.

**R-36. Détection du survol par les rectangles déjà calculés (R-23).** Pas de
`caretRangeFromPoint`, pas de recherche dichotomique, pas de calcul d'offset — et un code
identique pour `<textarea>` et `contenteditable`.

```js
let frame = 0;
champ.addEventListener('mousemove', (e) => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const z = zones.find(z => z.rects.some(r =>
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top  && e.clientY <= r.bottom));
    z ? programmerOuverture(z) : programmerFermeture();
  });
});
```

**R-37. Un tag césuré produit plusieurs rectangles.** Tester tous, ancrer l'infobulle sur
le **dernier** (le plus bas), sinon elle apparaît au milieu du texte.

**R-38. Temporisations** : ~180 ms avant ouverture (évite le clignotement au passage de la
souris), ~100 ms avant fermeture (évite le papillotement entre deux tags voisins). Un seul
minuteur, annulé à chaque changement de cible. Une seule infobulle réutilisée, jamais une
par tag.

**R-39. Fermer sur tout ce qui invalide la position** : `input`, `scroll` (capture,
passive), `wheel`, `blur`, `resize`, `Escape`. Ne pas repositionner en vol.

**R-40. Placement sous la ligne, bascule au-dessus si la place manque.** Mesurer après
avoir rendu l'infobulle présente mais `visibility: hidden`, sinon
`getBoundingClientRect()` renvoie zéro. Clamper horizontalement à la fenêtre.

**R-41. Trois lignes au maximum** : `nomReel` / libellé du type en clair (Personne,
Organisation, Lieu, Projet) / `email` si présent. **Traiter explicitement le code
inconnu** — tag édité à la main, alias supprimé, tag collé depuis un autre poste : bordure
d'alerte et message, jamais le silence. Ne pas afficher la date d'expiration de l'alias
en v1 : sa place est dans la page d'options.

**R-42. `textContent`, jamais `innerHTML`.** Le contenu vient de l'annuaire, donc de
saisies utilisateur : une entité nommée `<img onerror=…>` serait une injection dans le
contexte de la page. Doublement motivé par les politiques Trusted Types.

**R-43. La légende sous le champ est la base, l'infobulle est le raffinement.** Une liste
« `[PER:PDT]` → Pierre Dupont » ne dépend d'aucune mesure géométrique, survit à l'échec du
miroir, se lit sans manipulation et donne une vue d'ensemble du brouillon. Si l'un des
deux doit être livré en premier, c'est elle.

**R-44. Le clavier donne la même information que la souris.** À chaque changement de
sélection, si le curseur entre dans un tag, ouvrir la même infobulle ancrée dessus.

**R-45. Une région `aria-live="polite"` dans la racine.** L'arbre d'accessibilité inclut
le contenu d'un shadow root, donc elle est bien annoncée. En revanche les relations ARIA
par référence d'identifiant (`aria-describedby`, `aria-labelledby`) **ne franchissent pas**
la frontière — d'où le choix d'`aria-live` plutôt que d'un `aria-describedby`.

**R-46. Respecter `prefers-reduced-transparency` et `prefers-reduced-motion`.** La
transparence est un confort, pas une fonctionnalité.

---

## F. Intégrité des tags et garde-fou à l'envoi

**R-47. Une expression régulière unique**, partagée entre le calque, la restauration et
M-12 :

```js
const RE_TAG = /\[(PER|ORG|LIE|PRJ):([A-Z0-9]+(?:-\d+)?)\]/g;
```

**R-48. Détecter et signaler les tags cassés** — `[PER:PDT` non refermé, code absent de
l'annuaire : peints en rouge dans le calque, listés dans la légende. C'est le principal
effet de bord du mode fail-closed : l'utilisateur peut éditer *dans* un tag.

**R-49. Suppression quasi atomique.** Sur `keydown` `Backspace`/`Delete`, si le curseur est
à l'intérieur ou au bord d'un tag, sélectionner le tag entier et le supprimer d'un coup.
Évite les fragments `[PER:PD` qui ne révèlent rien mais polluent le prompt.

**R-50. Détection continue des vrais noms, pas seulement à l'envoi.** Sur `input`,
comparer `getText()` aux `nomReel` de l'annuaire — comparaison insensible à la casse et
aux diacritiques, bornée par des frontières de mot Unicode (`\p{L}`).

**R-51. Proposer, ne pas substituer en silence.** Un vrai nom détecté est souligné en
avertissement, un bouton « convertir » applique `replaceRange`. La substitution silencieuse
a été écartée avec le fail-open : ne pas la réintroduire par la fenêtre.

**R-52. Bloquer l'envoi sur détection.** Intercepter `Enter` et le clic ; si un vrai nom
connu ou un tag cassé subsiste, empêcher l'envoi et afficher la raison. C'est le seul
endroit où fogbank annule un événement — acceptable parce que rien n'est réémis derrière :
l'utilisateur renvoie lui-même.

**R-53. Ne pas prétendre détecter ce qui n'est pas dans l'annuaire.** Aucune détection
automatique d'entités (décision actée : les 4 types sont choisis manuellement). Le
garde-fou ne couvre que les entités déclarées — le dire dans l'UI.

---

## G. Restauration (M-07)

**R-54. Hook réseau entrant sur ChatGPT et Claude.** Réécrire le flux plutôt que le DOM :
React rend lui-même le vrai nom, aucun re-rendu ne l'écrase, les blocs CodeMirror et les
artefacts sont couverts, et le rechargement de conversation aussi.

**R-55. `TransformStream` avec report.** Le streaming coupe les tags entre deux chunks :
garder en réserve tout ce qui suit le dernier `[` non refermé.

```js
function unfogStream(res) {
  const dec = new TextDecoder(), enc = new TextEncoder();
  let carry = '';
  const ts = new TransformStream({
    async transform(chunk, ctrl) {
      let t = carry + dec.decode(chunk, { stream: true });
      const i = t.lastIndexOf('[');
      if (i !== -1 && !t.slice(i).includes(']')) { carry = t.slice(i); t = t.slice(0, i); }
      else carry = '';
      ctrl.enqueue(enc.encode(await ask('unfog', t)));
    },
    async flush(ctrl) { if (carry) ctrl.enqueue(enc.encode(await ask('unfog', carry))); }
  });
  return new Response(res.body.pipeThrough(ts),
    { status: res.status, statusText: res.statusText, headers: res.headers });
}
```

**R-56. Échapper les remplacements en contexte JSON.** Le flux SSE transporte du JSON
(`data: {"v":"…"}`). Un tag traverse sans échappement, mais un vrai nom peut contenir `"`
ou `\` et casser le parseur du site : `JSON.stringify(nomReel).slice(1, -1)`.

**R-57. Couvrir le rechargement d'historique et les titres**, pas seulement le flux de
complétion — sinon les pseudonymes réapparaissent après un F5. Endpoints dans les constats.

**R-58. `MutationObserver` assumé sur Copilot.** La réception WebSocket est réécrivable
mais fragile (`MessageEvent.data` en lecture seule, aller-retour asynchrone). **En mode
fail-closed, une restauration ratée n'est pas une fuite** — au pire un pseudonyme affiché
tel quel. Le repli DOM est donc acceptable, ce qu'il n'aurait pas été côté envoi.

**R-59. Ne jamais modifier la structure DOM dans un sous-arbre React.** Remplacer le
contenu d'un nœud texte, jamais ajouter ni retirer d'enfants : risque de
`NotFoundError: failed to execute 'removeChild'` et de crash du composant. Prévoir la
ré-application (scintillement assumé) après chaque re-rendu.

**R-60. Idempotence.** Ne jamais restaurer deux fois, ne jamais restaurer le texte que
l'utilisateur est en train d'écrire. Limiter `unfog` aux codes effectivement émis par ce
site et plafonner le débit du pont (R-01) : un site malveillant pourrait sinon interroger
l'annuaire par pseudonymes interposés.

---

## H. Maintenance, validation, périmètre

**R-61. Hiérarchie de stabilité des sélecteurs**, du plus au moins durable :

1. `id` stables (`#prompt-textarea`, `#thread`) — **des années**
2. `data-testid`, `data-message-author-role`, `data-content` — **plusieurs mois**
3. `aria-label`, `role`, `placeholder` — stables mais **dépendants de la langue**
4. classes utilitaires nommées (`.font-claude-response`) — **quelques mois**
5. classes CSS-modules hachées (`._prosemirror-parent_38p30_2`, `.group\/ai-message-item`)
   — **changent à chaque build**, jamais autrement qu'en dernier repli

**R-62. Exécuter la sonde de chaque constat au chargement** et alimenter un indicateur
« adaptateur sain / dégradé » dans le popup. Rejouer les sondes avant chaque release et à
chaque signalement de panne.

**R-63. Fixtures en deux variantes.** `tests/fixtures/mock-ai-site/` doit exister avec
`<textarea>` **et** avec `contenteditable`, pour exercer les deux `EditorHandle` sans
dépendre des sites réels.

### Limites à documenter dans le README

- **Pièces jointes** : un fichier téléversé part tel quel. M-12 existe pour cela, mais il
  faut le dire.
- **Applications mobile et bureau** : hors périmètre d'une extension navigateur.
- **Mémoire, projets, connaissances côté serveur** : ce qui a été envoyé en clair avant
  l'installation reste chez le fournisseur.
- **Contexte de page** : Copilot dans Edge peut transmettre le contenu de l'onglet actif
  (`edgepagecontext`). Non couvert.
- **Ré-identification** : un pseudonyme cohérent dans un contexte riche reste
  ré-identifiable. Le format « opaque » (ADR-002) réduit le risque visuel, pas le risque
  inférentiel.
- **M365 Copilot** : corpus tenant interrogé hors du prompt — pseudonymiser le prompt n'y
  pseudonymise pas grand-chose.

---

## I. Impacts sur les specs existantes

| Élément | Impact |
|---|---|
| **ADR-007** *(à rédiger)* | Fail-closed. Le tag est la source de vérité dans l'éditeur ; l'affichage ne fait que décorer. Motif : la substitution silencieuse à l'envoi est un point de défaillance unique et invisible. |
| **M-04** | Insère le **tag**, plus le vrai nom. |
| **M-05** | Devient « calque de décoration + infobulle + légende ». Reformuler : on souligne un tag et on révèle le vrai nom, pas l'inverse. |
| **M-06** | Redéfini : détection + garde-fou bloquant. Aucune écriture dans l'éditeur au moment de l'envoi. |
| **M-07** | Inchangé. Réseau sur ChatGPT et Claude, `MutationObserver` sur Copilot. |
| **Adaptateurs** | Perdent `extractPrompt`/`injectPrompt`, gagnent `inputKind` et `getComposer`. |
| **ADR-004** | Inchangé. Whitelist et `optional_host_permissions` restent cohérents. |
| **Fixtures** | Deux variantes de `mock-ai-site` (R-63). |

---

## J. Ordre d'implémentation

1. `EditorHandle` + les deux implémentations, contre les deux fixtures (R-08 → R-12).
2. Racine fermée et couche d'affichage vide (R-25 → R-30) — socle de tout le reste.
3. Menu `&` et insertion de tag sur la fixture `<textarea>`, la plus simple (R-22).
4. **Légende sous le champ** (R-43) — livrable utile même sans le calque.
5. Calque de soulignement sur `<textarea>` (R-19 → R-24, R-31 → R-33) — le morceau le plus
   délicat, à sortir tôt.
6. Infobulle (R-34 → R-46).
7. Portage sur `contenteditable`, où `getRangeRects()` devient trivial.
8. Intégrité des tags et garde-fou à l'envoi (R-47 → R-53).
9. M-07 : réseau sur ChatGPT et Claude, puis `MutationObserver` sur Copilot (R-54 → R-60).
