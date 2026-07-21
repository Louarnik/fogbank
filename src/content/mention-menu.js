// Menu de mention déclenché par le caractère configuré (M-03/M-04/M-05).
// UC-001 : sélection uniquement parmi l'annuaire existant, pas de création
// à la volée (voir docs/SPECS.md, UC-001, Contraintes). Scope limité au
// contenteditable.
window.fogbankMentionMenu = (function () {
  let etatMenu = null; // { mention, resultats, elementMenu }
  let indexSurligne = 0;

  function texteAvantCaret() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    return {
      noeud: range.startContainer,
      offset: range.startOffset,
      texte: range.startContainer.textContent.slice(0, range.startOffset),
    };
  }

  function detecterMention(caractereDeclencheur) {
    const info = texteAvantCaret();
    if (!info) return null;
    const debut = info.texte.lastIndexOf(caractereDeclencheur);
    if (debut === -1) return null;
    const filtre = info.texte.slice(debut + 1);
    if (/\s/.test(filtre)) return null; // un espace abandonne la mention en cours
    return { noeud: info.noeud, debut, fin: info.offset, filtre };
  }

  function fermerMenu() {
    if (etatMenu && etatMenu.elementMenu) {
      etatMenu.elementMenu.remove();
    }
    etatMenu = null;
  }

  function positionnerMenu(elementMenu) {
    const sel = window.getSelection();
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    elementMenu.style.left = `${rect.left}px`;
    elementMenu.style.top = `${rect.bottom + 4}px`;
  }

  function surligner(elementMenu, index) {
    Array.from(elementMenu.children).forEach((el, i) => {
      el.style.background = i === index ? '#e8f0fe' : '';
    });
  }

  function creerElementMenu(resultats, onChoisir) {
    const el = document.createElement('div');
    el.className = 'fogbank-mention-menu';
    Object.assign(el.style, {
      position: 'fixed',
      zIndex: '2147483647',
      background: '#fff',
      border: '1px solid #ccc',
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      minWidth: '180px',
      maxHeight: '200px',
      overflowY: 'auto',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
    });
    resultats.forEach((entite) => {
      const item = document.createElement('div');
      item.textContent = `${entite.nomReel} (${entite.type})`;
      Object.assign(item.style, { padding: '6px 10px', cursor: 'pointer' });
      // mousedown (pas click) : évite que le champ perde la sélection avant
      // que le gestionnaire ne s'exécute.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onChoisir(entite);
      });
      el.appendChild(item);
    });
    return el;
  }

  async function inserer(mention, entite, options) {
    const { noeud, debut, fin } = mention;
    const texteComplet = noeud.textContent;
    const avant = texteComplet.slice(0, debut);
    const apres = texteComplet.slice(fin);

    const code = await options.obtenirOuCreerAlias(entite);

    const span = document.createElement('span');
    span.setAttribute('contenteditable', 'false');
    span.dataset.fogbankEntityId = entite.id;
    span.dataset.fogbankType = entite.type;
    span.title = `[${entite.type}:${code}]`;
    span.textContent = entite.nomReel;
    Object.assign(span.style, {
      textDecoration: 'underline',
      textDecorationColor: '#2d6cdf',
      textDecorationThickness: '2px',
      cursor: 'default',
    });

    const parent = noeud.parentNode;
    const noeudApres = document.createTextNode(apres);
    const noeudAvant = document.createTextNode(avant);
    parent.replaceChild(noeudApres, noeud);
    parent.insertBefore(span, noeudApres);
    parent.insertBefore(noeudAvant, span);

    const range = document.createRange();
    range.setStart(noeudApres, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function attacher(champ, options) {
    champ.addEventListener('input', () => {
      const mention = detecterMention(options.caractereDeclencheur);
      if (!mention) {
        fermerMenu();
        return;
      }
      const resultats = options.rechercherEntites(mention.filtre);
      fermerMenu();
      if (resultats.length === 0) return;

      indexSurligne = 0;
      const elementMenu = creerElementMenu(resultats, (entite) => {
        inserer(mention, entite, options);
        fermerMenu();
      });
      document.body.appendChild(elementMenu);
      positionnerMenu(elementMenu);
      surligner(elementMenu, indexSurligne);
      etatMenu = { mention, resultats, elementMenu };
    });

    champ.addEventListener('keydown', (e) => {
      if (!etatMenu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        fermerMenu();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        indexSurligne = Math.min(indexSurligne + 1, etatMenu.resultats.length - 1);
        surligner(etatMenu.elementMenu, indexSurligne);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        indexSurligne = Math.max(indexSurligne - 1, 0);
        surligner(etatMenu.elementMenu, indexSurligne);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const { mention, resultats } = etatMenu;
        const entite = resultats[indexSurligne];
        fermerMenu();
        inserer(mention, entite, options);
      }
    });
  }

  return { attacher };
})();
