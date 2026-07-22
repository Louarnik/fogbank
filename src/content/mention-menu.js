// Menu de mention déclenché par le caractère configuré (M-03/M-04).
// Fail-closed (ADR-007, voir docs/SPECS.md UC-001) : la sélection insère le
// tag [TYP:CODE] directement dans le champ via EditorHandle.replaceRange —
// jamais le vrai nom. Aucun marquage DOM ici : la décoration (soulignement,
// infobulle, légende) est prise en charge séparément par fogbankDisplay, qui
// parse le texte du champ en continu plutôt que de dépendre d'un span posé
// à l'insertion.
window.fogbankMentionMenu = (function () {
  let etatMenu = null; // { mention, resultats, elementMenu }
  let indexSurligne = 0;

  function fermerMenu() {
    if (etatMenu && etatMenu.elementMenu) {
      etatMenu.elementMenu.remove();
    }
    etatMenu = null;
  }

  // Placement sous le curseur, bascule au-dessus si la place manque en bas
  // de la fenêtre (même principe que l'infobulle de fogbankDisplay) : sans
  // ça, un champ proche du bas du viewport (composer ancré en bas de
  // page, cas courant des vrais sites de chat) pousse le menu hors écran
  // plutôt que de l'afficher lisiblement. `elementMenu` est déjà inséré
  // dans le DOM à cet instant : sa hauteur réelle (offsetHeight) est
  // mesurable avant de choisir où le placer.
  function positionnerMenu(elementMenu, handle) {
    const rect = handle.getCaretRect();
    const hauteurMenu = elementMenu.offsetHeight;
    const placeSousLeCurseur = window.innerHeight - rect.bottom - 4;
    elementMenu.style.top =
      hauteurMenu > placeSousLeCurseur && rect.top - hauteurMenu - 4 > 0
        ? `${rect.top - hauteurMenu - 4}px`
        : `${rect.bottom + 4}px`;

    const largeurMenu = elementMenu.offsetWidth;
    const gauche = Math.min(rect.left, window.innerWidth - largeurMenu - 4);
    elementMenu.style.left = `${Math.max(0, gauche)}px`;
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

  function detecterMention(handle, caractereDeclencheur) {
    const { fin } = handle.getSelection();
    const avantCaret = handle.getText().slice(0, fin);
    const debut = avantCaret.lastIndexOf(caractereDeclencheur);
    if (debut === -1) return null;
    const filtre = avantCaret.slice(debut + 1);
    if (/\s/.test(filtre)) return null; // un espace abandonne la mention en cours
    return { debut, fin, filtre };
  }

  // Insère le tag [TYP:CODE] — jamais le vrai nom (fail-closed). Si
  // l'entité n'a pas encore d'alias pour le site courant, un nouvel alias
  // est généré immédiatement (M-10) pour que le tag inséré soit déjà correct.
  function inserer(mention, entite, handle, options) {
    const code = options.obtenirOuCreerAlias(entite);
    const tag = `[${entite.type}:${code}]`;
    handle.replaceRange(mention.debut, mention.fin, tag);
    const position = mention.debut + tag.length;
    handle.setSelection(position, position);
  }

  // Suppression quasi atomique (R-49) : si le curseur est au bord ou à
  // l'intérieur d'un tag, Backspace/Delete supprime le tag entier d'un
  // coup, pour éviter les fragments `[PER:PD` qui ne révèlent rien mais
  // polluent le prompt et cassent la détection par regex du calque.
  function supprimerTagAtomique(e, handle, options) {
    const { debut, fin } = handle.getSelection();
    if (debut !== fin) return; // sélection non vide : comportement natif
    const texte = handle.getText();
    const regex = options.creerRegexTag();
    let m = regex.exec(texte);
    while (m) {
      const zoneDebut = m.index;
      const zoneFin = m.index + m[0].length;
      const curseurDansTag =
        e.key === 'Backspace'
          ? debut > zoneDebut && debut <= zoneFin
          : debut >= zoneDebut && debut < zoneFin;
      if (curseurDansTag) {
        e.preventDefault();
        handle.replaceRange(zoneDebut, zoneFin, '');
        handle.setSelection(zoneDebut, zoneDebut);
        return;
      }
      m = regex.exec(texte);
    }
  }

  function attacher(champ, handle, options) {
    champ.addEventListener('input', (e) => {
      // R-13 : neutraliser pendant la composition IME (japonais/chinois/
      // coréen) — réagir seulement une fois la frappe finalisée
      // (compositionend redéclenche un événement input sur Chromium).
      if (e.isComposing) return;

      const mention = detecterMention(handle, options.caractereDeclencheur);
      if (!mention) {
        fermerMenu();
        return;
      }
      const resultats = options.rechercherEntites(mention.filtre);
      fermerMenu();
      if (resultats.length === 0) return;

      indexSurligne = 0;
      const elementMenu = creerElementMenu(resultats, (entite) => {
        inserer(mention, entite, handle, options);
        fermerMenu();
      });
      document.body.appendChild(elementMenu);
      positionnerMenu(elementMenu, handle);
      surligner(elementMenu, indexSurligne);
      etatMenu = { mention, resultats, elementMenu };
    });

    // capture:true + stopPropagation() : défense utile contre un
    // gestionnaire natif attaché plus haut dans l'arbre (ex. un <form> qui
    // soumet sur Entrée en phase de bouillonnement) — mais insuffisante
    // contre un éditeur comme ProseMirror (Claude.ai), qui attache sa
    // propre écoute native `keydown` DIRECTEMENT sur le même champ que
    // nous : pour un même élément cible, les écouteurs s'exécutent dans
    // leur ORDRE D'ATTACHE, capture ou non — le sien, posé au montage de
    // l'éditeur bien avant que ce content script ne s'exécute, gagne
    // toujours la course sur Entrée. Espace n'a pas cet adversaire (aucun
    // éditeur ne s'en sert pour envoyer) : on l'accepte donc en plus comme
    // touche de confirmation, plus fiable qu'Entrée sur un vrai site.
    champ.addEventListener('keydown', (e) => {
      if (etatMenu) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          fermerMenu();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          indexSurligne = Math.min(indexSurligne + 1, etatMenu.resultats.length - 1);
          surligner(etatMenu.elementMenu, indexSurligne);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          indexSurligne = Math.max(indexSurligne - 1, 0);
          surligner(etatMenu.elementMenu, indexSurligne);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          const { mention, resultats } = etatMenu;
          const entite = resultats[indexSurligne];
          fermerMenu();
          inserer(mention, entite, handle, options);
          return;
        }
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        supprimerTagAtomique(e, handle, options);
      }
    }, { capture: true });
  }

  return { attacher };
})();
