// Menu de mention déclenché par le caractère configuré (M-03/M-04).
//
// Le panneau est en clair (voir docs/SPECS.md § Vue d'ensemble) : la
// sélection insère l'entité (nom réel) dans le champ, jamais le tag — le
// tag n'existe qu'au moment de la réplication vers le site (voir
// UC-004/sidepanel.js). Sans délimiteur structurel comme `[TYP:ALIAS]` à
// re-détecter par regex, chaque mention insérée est suivie par position
// (`mentions`, tableau `{debut, fin, entite, alias}`) plutôt que
// redécouverte en reparcourant le texte — display.js consomme cette liste
// via `obtenirMentions()` plutôt que de la reconstruire lui-même.
window.fogbankMentionMenu = (function () {
  let etatMenu = null; // { mention, resultats, elementMenu }
  let indexSurligne = 0;

  const TOUCHES_NAVIGATION = new Set([
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End',
    'PageUp', 'PageDown', 'Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
  ]);

  function fermerMenu() {
    if (etatMenu && etatMenu.elementMenu) {
      etatMenu.elementMenu.remove();
    }
    etatMenu = null;
  }

  // Placement sous le curseur, bascule au-dessus si la place manque en bas
  // du panneau (même principe que l'infobulle de fogbankDisplay) : sans
  // ça, un champ proche du bas du viewport pousse le menu hors écran
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

  // Plage exactement modifiée entre deux versions du texte (préfixe/suffixe
  // communs) : plus robuste qu'une déduction depuis la seule touche appuyée
  // (fonctionne aussi pour un collage, une composition IME, une correction
  // automatique...).
  function trouverPlageEditee(avant, apres) {
    const min = Math.min(avant.length, apres.length);
    let debut = 0;
    while (debut < min && avant[debut] === apres[debut]) debut += 1;
    let finAvant = avant.length;
    let finApres = apres.length;
    while (finAvant > debut && finApres > debut && avant[finAvant - 1] === apres[finApres - 1]) {
      finAvant -= 1;
      finApres -= 1;
    }
    return { debut, finAvant, finApres };
  }

  // Décale les mentions après une édition ailleurs dans le texte ; une
  // mention qui chevauche la plage éditée est abandonnée (voir Contraintes,
  // docs/SPECS.md UC-001) — son texte n'est plus garanti être exactement le
  // nom réel attendu, donc plus question de la reconstruire en tag fiable
  // à la réplication (UC-004). La protection atomique (Backspace/Delete,
  // blocage de frappe à l'intérieur) vise à rendre ce cas rare ; un collage
  // chevauchant une mention reste un angle mort assumé — l'absence de
  // soulignement qui en résulte reste le seul signal visible.
  function ajusterMentions(mentions, avant, apres) {
    if (avant === apres || mentions.length === 0) return mentions;
    const { debut, finAvant, finApres } = trouverPlageEditee(avant, apres);
    const delta = finApres - finAvant;
    const resultat = [];
    mentions.forEach((m) => {
      if (m.fin <= debut) {
        resultat.push(m);
      } else if (m.debut >= finAvant) {
        resultat.push({ ...m, debut: m.debut + delta, fin: m.fin + delta });
      }
      // sinon : chevauchement avec la plage éditée, mention abandonnée.
    });
    return resultat;
  }

  function mentionInterieure(mentions, position) {
    return mentions.find((m) => position > m.debut && position < m.fin);
  }

  function mentionAuBord(mentions, position, key) {
    return mentions.find((m) =>
      key === 'Backspace' ? position > m.debut && position <= m.fin : position >= m.debut && position < m.fin
    );
  }

  // Insère le VRAI NOM (pas le tag, voir en-tête de fichier) via
  // EditorHandle.replaceRange, puis enregistre la mention par position.
  // Alias obtenu/généré immédiatement (M-10) pour que le code soit déjà
  // correct si la mention est répliquée dans la foulée.
  // `handle.replaceRange` déclenche un `input` natif **synchrone**
  // (execCommand) : le gestionnaire posé dans `attacher()` ci-dessous
  // s'exécute donc en réentrance, à l'intérieur même de cet appel, et
  // décale déjà les mentions existantes via `ajusterMentions` avant qu'on
  // revienne ici — ne reste qu'à ajouter la nouvelle, jamais à redécaler
  // les autres soi-même (double décalage sinon).
  // Cette réentrance a un effet de bord sur le soulignement (fogbankDisplay) :
  // son propre listener `input` s'exécute lui aussi pendant ce
  // `replaceRange`, donc *avant* le `mentions.push` juste en dessous — le
  // trait de la mention qu'on est en train d'ajouter est alors dessiné une
  // frappe en retard. `options.onMentionsChanged()` prévient explicitement
  // fogbankDisplay une fois la mention réellement en place.
  function inserer(mention, entite, handle, options, mentions) {
    const alias = options.obtenirOuCreerAlias(entite);
    const nomReel = entite.nomReel;
    handle.replaceRange(mention.debut, mention.fin, nomReel);
    mentions.push({ debut: mention.debut, fin: mention.debut + nomReel.length, entite, alias });
    mentions.sort((a, b) => a.debut - b.debut);
    const position = mention.debut + nomReel.length;
    handle.setSelection(position, position);
    if (options.onMentionsChanged) options.onMentionsChanged();
  }

  // Suppression atomique : Backspace/Delete au bord ou à l'intérieur
  // d'une mention la supprime entière d'un coup, pour ne jamais laisser un
  // nom réel tronqué (ni visuellement, ni surtout dans ce qui serait
  // reconstruit en tag à la réplication). Même remarque de réentrance que
  // `inserer` ci-dessus : le retrait de `mentions` est déjà fait par
  // `ajusterMentions` (la plage éditée équivaut exactement à la mention,
  // donc écartée par recouvrement) — rien à refaire ici après l'appel.
  function supprimerMentionAtomique(e, handle, mentions) {
    const { debut, fin } = handle.getSelection();
    if (debut !== fin) return; // sélection non vide : comportement natif
    const m = mentionAuBord(mentions, debut, e.key);
    if (!m) return;
    e.preventDefault();
    handle.replaceRange(m.debut, m.fin, '');
    handle.setSelection(m.debut, m.debut);
  }

  function attacher(champ, handle, options) {
    const mentions = [];
    let texteConnu = handle.getText();

    champ.addEventListener('input', (e) => {
      // Neutraliser pendant la composition IME (japonais/chinois/
      // coréen) — réagir seulement une fois la frappe finalisée
      // (compositionend redéclenche un événement input sur Chromium).
      if (e.isComposing) return;

      const texteActuel = handle.getText();
      const misesAJour = ajusterMentions(mentions, texteConnu, texteActuel);
      mentions.length = 0;
      mentions.push(...misesAJour);
      texteConnu = texteActuel;

      // Pause temporaire (bascule depuis la popup) : reprend sans recharger
      // la page, contrairement à l'activation/désactivation par site.
      if (options.estEnPause && options.estEnPause()) {
        fermerMenu();
        return;
      }

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
        inserer(mention, entite, handle, options, mentions);
        texteConnu = handle.getText();
        fermerMenu();
      });
      document.body.appendChild(elementMenu);
      positionnerMenu(elementMenu, handle);
      surligner(elementMenu, indexSurligne);
      etatMenu = { mention, resultats, elementMenu };
    });

    // capture:true + stopPropagation() : défense utile contre un
    // gestionnaire natif attaché plus haut dans l'arbre (ex. un <form> qui
    // soumettrait sur Entrée en phase de bouillonnement). Le champ étant un
    // <textarea> propre au panneau (voir ADR-008), Entrée, Tab et Espace
    // sont trois touches de confirmation équivalentes, sans concurrence
    // d'un éditeur tiers à gérer.
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
          inserer(mention, entite, handle, options, mentions);
          texteConnu = handle.getText();
          return;
        }
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        supprimerMentionAtomique(e, handle, mentions);
        texteConnu = handle.getText();
        return;
      }

      // Frappe normale avec le curseur strictement à l'intérieur d'une
      // mention (pas à son bord, voir mentionInterieure) : bloquée plutôt
      // que de risquer de corrompre le nom réel affiché — Backspace/Delete
      // déjà traités ci-dessus, Ctrl/Meta laissés passer (copier, tout
      // sélectionner...).
      if (!e.ctrlKey && !e.metaKey && !TOUCHES_NAVIGATION.has(e.key)) {
        const { debut, fin } = handle.getSelection();
        if (debut === fin && mentionInterieure(mentions, debut)) {
          e.preventDefault();
        }
      }
    }, { capture: true });

    return {
      obtenirMentions: () => mentions.slice(),
    };
  }

  return { attacher };
})();
