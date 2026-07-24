// EditorHandle pour <textarea> (et <input type="text">) — voir ADR-008.
// Un <textarea> n'expose aucun nœud DOM pour son contenu (ni Range, ni
// getClientRects()) : les coordonnées sont
// reconstruites via un miroir — un <div> invisible qui copie les propriétés
// calculées du champ pour que la même chaîne de caractères y occupe
// exactement la même position visuelle.
window.fogbankTextareaHandle = (function () {
  // Propriétés calculées à copier exhaustivement — un oubli décale
  // tout le texte en aval.
  const PROPRIETES_MIROIR = [
    'boxSizing', 'width', 'height',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'tabSize',
    'textTransform', 'textIndent', 'textRendering',
  ];

  function creerMiroir(champ) {
    const miroir = document.createElement('div');
    Object.assign(miroir.style, {
      position: 'absolute',
      visibility: 'hidden',
      overflow: 'hidden',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'break-word',
      top: '0',
      left: '-9999px',
    });
    const cs = getComputedStyle(champ);
    PROPRIETES_MIROIR.forEach((prop) => {
      miroir.style[prop] = cs[prop];
    });
    document.body.appendChild(miroir);
    return miroir;
  }

  function creer(champ) {
    const miroir = creerMiroir(champ);

    // Position du curseur : le miroir reçoit le texte jusqu'à `offset`, un
    // repère y est ajouté, sa position dans le miroir donne la position
    // réelle dans le champ (une fois recalée sur son rect et son scroll).
    // Quirk dernière ligne : si le texte avant le repère se termine par un
    // saut de ligne, le miroir collapse la ligne vide sans caractère de
    // garde.
    function rectDepuisOffset(offset) {
      const avant = champ.value.slice(0, offset);
      miroir.textContent = '';
      miroir.appendChild(document.createTextNode(avant.endsWith('\n') ? avant + '\u200b' : avant));
      const repere = document.createElement('span');
      repere.textContent = champ.value.slice(offset) || '.';
      miroir.appendChild(repere);
      const rChamp = champ.getBoundingClientRect();
      const rect = new DOMRect(
        rChamp.left + repere.offsetLeft - champ.scrollLeft,
        rChamp.top + repere.offsetTop - champ.scrollTop,
        0,
        parseFloat(getComputedStyle(champ).lineHeight) || repere.offsetHeight
      );
      miroir.textContent = '';
      return rect;
    }

    // Rectangles d'une plage : la plage est enveloppée dans un
    // <span> du miroir, ses getClientRects() donnent un rectangle par ligne
    // visuelle (utile pour un tag qui casse en fin de ligne).
    function rectsDepuisPlage(debut, fin) {
      miroir.textContent = '';
      miroir.appendChild(document.createTextNode(champ.value.slice(0, debut)));
      const span = document.createElement('span');
      span.textContent = champ.value.slice(debut, fin) || ' ';
      miroir.appendChild(span);
      miroir.appendChild(document.createTextNode(champ.value.slice(fin)));

      // span.getClientRects() renvoie des coordonnées dans le même espace
      // que miroir.getBoundingClientRect() (le miroir est hors-écran, mais
      // c'est un espace de coordonnées cohérent) : la différence entre les
      // deux donne une position relative à l'origine du miroir, du même
      // principe que offsetLeft/offsetTop utilisés par rectDepuisOffset —
      // à ne pas réappliquer rChamp directement sur des rects déjà
      // absolus, ce qui décalerait tout de la position réelle du miroir.
      const rMiroir = miroir.getBoundingClientRect();
      const rChamp = champ.getBoundingClientRect();
      const decalX = rChamp.left - champ.scrollLeft - rMiroir.left;
      const decalY = rChamp.top - champ.scrollTop - rMiroir.top;
      const rects = Array.from(span.getClientRects()).map(
        (r) => new DOMRect(r.left + decalX, r.top + decalY, r.width, r.height)
      );
      miroir.textContent = '';
      return rects;
    }

    return {
      getText() {
        return champ.value;
      },

      getSelection() {
        return { debut: champ.selectionStart, fin: champ.selectionEnd };
      },

      setSelection(debut, fin) {
        champ.setSelectionRange(debut, fin);
      },

      // Primitive d'écriture unique : execCommand('insertText') émet
      // un beforeinput natif que React traite comme une frappe réelle, et
      // conserve la pile d'annulation (Ctrl+Z). Repli : le setter du
      // *prototype* HTMLTextAreaElement, pour contourner le _valueTracker
      // React qui ignore une affectation directe sur l'instance.
      replaceRange(debut, fin, texte) {
        champ.focus();
        champ.setSelectionRange(debut, fin);
        const ok = document.execCommand('insertText', false, texte);
        if (!ok) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          ).set;
          const valeur = champ.value;
          setter.call(champ, valeur.slice(0, debut) + texte + valeur.slice(fin));
          champ.setSelectionRange(debut + texte.length, debut + texte.length);
          champ.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      },

      getCaretRect() {
        return rectDepuisOffset(champ.selectionStart);
      },

      getRangeRects(debut, fin) {
        return rectsDepuisPlage(debut, fin);
      },

      onInput(cb) {
        champ.addEventListener('input', cb);
        return () => champ.removeEventListener('input', cb);
      },
    };
  }

  return { creer };
})();
