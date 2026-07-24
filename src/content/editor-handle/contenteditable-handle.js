// EditorHandle pour <div contenteditable> — le champ de composition du
// panneau est entièrement sous notre contrôle (voir ADR-008) : plus besoin
// de reconstruire les coordonnées via un miroir hors-écran (l'ancienne
// approche pour <textarea>, voir textarea-handle.js) — un contenteditable
// expose nativement Range/getClientRects, toujours synchronisés avec la
// taille réelle du champ (le miroir, lui, ne l'était qu'à sa création :
// source du soulignement dupliqué/manquant au redimensionnement).
//
// Le reste du pipeline (mention-menu.js, pseudonyme.js...) traite le texte
// comme une chaîne plate avec de simples offsets — un saut de ligne doit
// donc rester un caractère '\n' dans un nœud texte (rendu grâce à
// white-space: pre-wrap sur le champ, voir sidepanel.css), jamais un
// <br>/<div> introduit par le comportement par défaut du navigateur : Entrée
// et le collage sont donc interceptés ci-dessous pour le garantir.
window.fogbankContentEditableHandle = (function () {
  function creer(champ) {
    champ.contentEditable = 'true';

    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n');
      }
    });

    // Collage toujours en texte brut : un <b>/<div> collé introduirait un
    // nœud non-texte entre deux offsets qui doivent rester adjacents.
    champ.addEventListener('paste', (e) => {
      e.preventDefault();
      const texte = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, texte);
    });

    function noeudDepuisOffset(offset) {
      let reste = offset;
      const marcheur = document.createTreeWalker(champ, NodeFilter.SHOW_TEXT);
      let noeud = marcheur.nextNode();
      let dernier = null;
      while (noeud) {
        const len = noeud.data.length;
        if (reste <= len) return { noeud, offset: reste };
        reste -= len;
        dernier = noeud;
        noeud = marcheur.nextNode();
      }
      // Offset au-delà du dernier caractère (ou champ vide) : ancre sur le
      // champ lui-même plutôt que planter.
      return dernier ? { noeud: dernier, offset: dernier.data.length } : { noeud: champ, offset: 0 };
    }

    function offsetDepuisNoeud(noeudCible, offsetCible) {
      if (noeudCible === champ) return 0;
      const marcheur = document.createTreeWalker(champ, NodeFilter.SHOW_TEXT);
      let noeud = marcheur.nextNode();
      let total = 0;
      while (noeud) {
        if (noeud === noeudCible) return total + offsetCible;
        total += noeud.data.length;
        noeud = marcheur.nextNode();
      }
      return total;
    }

    function creerRange(debut, fin) {
      const a = noeudDepuisOffset(debut);
      const b = noeudDepuisOffset(fin);
      const range = document.createRange();
      range.setStart(a.noeud, a.offset);
      range.setEnd(b.noeud, b.offset);
      return range;
    }

    const handle = {
      getText() {
        return champ.textContent;
      },

      getSelection() {
        const sel = window.getSelection();
        if (!sel.rangeCount || !champ.contains(sel.anchorNode)) return { debut: 0, fin: 0 };
        const range = sel.getRangeAt(0);
        const debut = offsetDepuisNoeud(range.startContainer, range.startOffset);
        const fin = offsetDepuisNoeud(range.endContainer, range.endOffset);
        return debut <= fin ? { debut, fin } : { debut: fin, fin: debut };
      },

      setSelection(debut, fin) {
        champ.focus();
        const range = creerRange(debut, fin);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },

      // Primitive d'écriture unique, comme pour l'ancien TextareaHandle :
      // execCommand('insertText') conserve la pile d'annulation (Ctrl+Z) et
      // émet un input natif. Bien mieux supporté ici que sur un <textarea>
      // (c'est justement pour ça qu'un repli existait côté textarea-handle),
      // gardé quand même par défense en profondeur.
      replaceRange(debut, fin, texte) {
        handle.setSelection(debut, fin);
        if (!document.execCommand('insertText', false, texte)) {
          const range = creerRange(debut, fin);
          range.deleteContents();
          range.insertNode(document.createTextNode(texte));
          champ.normalize();
          handle.setSelection(debut + texte.length, debut + texte.length);
          champ.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
      },

      getCaretRect() {
        const { fin } = handle.getSelection();
        const range = creerRange(fin, fin);
        const rects = range.getClientRects();
        if (rects.length) return rects[0];
        const r = champ.getBoundingClientRect();
        return new DOMRect(r.left, r.top, 0, parseFloat(getComputedStyle(champ).lineHeight) || r.height);
      },

      getRangeRects(debut, fin) {
        if (debut === fin) return [];
        return Array.from(creerRange(debut, fin).getClientRects());
      },

      onInput(cb) {
        champ.addEventListener('input', cb);
        return () => champ.removeEventListener('input', cb);
      },
    };

    return handle;
  }

  return { creer };
})();
