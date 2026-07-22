// EditorHandle pour un champ contenteditable — voir ADR-007 et
// docs/recherche/reco.md, R-08 à R-18. Contrairement à <textarea>, un
// contenteditable expose un vrai DOM pour son contenu : les rectangles
// s'obtiennent trivialement via Range.getClientRects() (R-24), aucun miroir
// n'est nécessaire.
//
// Simplification assumée : le champ est traité comme du texte plat (un ou
// plusieurs nœuds texte, sans éléments imbriqués) — vrai depuis ADR-007
// puisque fogbank n'écrit plus jamais de <span> dans le champ lui-même (la
// décoration vit entièrement dans la racine shadow DOM séparée, voir
// display.js). Les offsets manipulés ici sont des positions de caractère
// dans `champ.textContent`, pas des positions DOM natives.
window.fogbankContentEditableHandle = (function () {
  // Position de caractère (relative à champ.textContent) -> (nœud texte,
  // offset dans ce nœud), utilisable dans un Range.
  function pointDepuisOffset(champ, offsetCible) {
    const marcheur = document.createTreeWalker(champ, NodeFilter.SHOW_TEXT);
    let total = 0;
    let dernierNoeud = null;
    let n = marcheur.nextNode();
    while (n) {
      const longueur = n.textContent.length;
      if (offsetCible <= total + longueur) {
        return { noeud: n, offset: offsetCible - total };
      }
      total += longueur;
      dernierNoeud = n;
      n = marcheur.nextNode();
    }
    if (dernierNoeud) return { noeud: dernierNoeud, offset: dernierNoeud.textContent.length };
    return { noeud: champ, offset: 0 };
  }

  // Inverse : (nœud, offset) d'un Range natif -> position de caractère
  // relative à champ.textContent.
  function offsetDepuisPoint(champ, noeudCible, offsetNoeud) {
    const marcheur = document.createTreeWalker(champ, NodeFilter.SHOW_TEXT);
    let total = 0;
    let n = marcheur.nextNode();
    while (n) {
      if (n === noeudCible) return total + offsetNoeud;
      total += n.textContent.length;
      n = marcheur.nextNode();
    }
    return total;
  }

  function creerRange(champ, debut, fin) {
    const { noeud: n1, offset: o1 } = pointDepuisOffset(champ, debut);
    const { noeud: n2, offset: o2 } = pointDepuisOffset(champ, fin);
    const range = document.createRange();
    range.setStart(n1, o1);
    range.setEnd(n2, o2);
    return range;
  }

  function creer(champ) {
    return {
      getText() {
        return champ.textContent;
      },

      getSelection() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !champ.contains(sel.anchorNode)) {
          const fin = champ.textContent.length;
          return { debut: fin, fin };
        }
        const range = sel.getRangeAt(0);
        const debut = offsetDepuisPoint(champ, range.startContainer, range.startOffset);
        const fin = offsetDepuisPoint(champ, range.endContainer, range.endOffset);
        return { debut, fin };
      },

      setSelection(debut, fin) {
        const range = creerRange(champ, debut, fin);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },

      // Primitive d'écriture unique (R-10) : execCommand('insertText') émet
      // un beforeinput natif accepté par ProseMirror comme une frappe
      // réelle (une affectation directe via textContent/innerHTML n'atteint
      // pas son modèle interne — voir ADR-007) et conserve la pile
      // d'annulation.
      replaceRange(debut, fin, texte) {
        champ.focus();
        this.setSelection(debut, fin);
        return document.execCommand('insertText', false, texte);
      },

      getCaretRect() {
        const { fin } = this.getSelection();
        const range = creerRange(champ, fin, fin);
        const rects = range.getClientRects();
        if (rects.length > 0) return rects[rects.length - 1];
        return champ.getBoundingClientRect();
      },

      getRangeRects(debut, fin) {
        return Array.from(creerRange(champ, debut, fin).getClientRects());
      },

      onInput(cb) {
        champ.addEventListener('input', cb);
        return () => champ.removeEventListener('input', cb);
      },
    };
  }

  return { creer };
})();
