// Adaptateur dédié — Claude.ai. Sélecteurs relevés dans
// docs/recherche/constat-claude.md (non vérifiés en direct — sonde du §8 à
// rejouer si le comportement dévie). Remplace le repli générique dont
// l'heuristique par position DOM (premier bouton après le champ, puis
// remontée d'ancêtres) se trompe de zone de réponse dès que le composer
// contient plusieurs boutons avant celui d'envoi (pièce jointe, sélecteur
// de modèle...) : le MutationObserver de réception pointait alors vers un
// élément qui ne recevait jamais la vraie réponse — bug « le texte reste
// en fog » observé aussi bien sur la fixture que sur le site réel.
window.fogbankClaudeAdapter = {
  matches() {
    return /(^|\.)claude\.ai$/.test(location.hostname);
  },

  // div.ProseMirror[contenteditable] peut correspondre à plusieurs éléments
  // (renommage de conversation, édition d'un message précédent — constat
  // §2.2) : seul le premier (le composer principal, toujours monté en
  // premier dans le DOM) est câblé. Un éditeur ouvert plus tard par une
  // action utilisateur est de toute façon absent au chargement initial —
  // c'est le MutationObserver de résilience de content.js qui le détecte.
  getInputFields() {
    const champ = document.querySelector('div.ProseMirror[contenteditable="true"]');
    return champ ? [champ] : [];
  },

  // Pas d'ancre stable équivalente au #thread de ChatGPT (constat §6) :
  // remonte depuis les tours de conversation actuellement présents jusqu'à
  // leur ancêtre commun le plus proche, plutôt que de deviner une
  // profondeur fixe — robuste même si un tour individuel est lui-même
  // enveloppé (virtualisation, wrapper d'animation...).
  getResponseContainer() {
    const tours = document.querySelectorAll('.group\\/conversation-turn');
    if (tours.length === 0) return null;
    let ancre = tours[0].parentElement;
    while (ancre && ancre !== document.body) {
      if (Array.from(tours).every((t) => ancre.contains(t))) return ancre;
      ancre = ancre.parentElement;
    }
    return null;
  },

  // data-is-streaming, porté par le message assistant lui-même (constat
  // §4.2), non confirmé en direct — traité comme un signal d'appoint, pas
  // comme la seule source de vérité (voir onStreamingEnd).
  isStreaming(container) {
    if (!container) return false;
    const marque = container.querySelector('[data-is-streaming]');
    return marque ? marque.getAttribute('data-is-streaming') === 'true' : false;
  },

  // Base identique au repli générique (inactivité du MutationObserver) :
  // si data-is-streaming n'existe pas ou plus sur ce site, le comportement
  // dégrade proprement vers l'inactivité seule plutôt que de ne jamais se
  // déclencher. Quand le signal est présent, il ne fait qu'empêcher une
  // substitution prématurée pendant une pause réseau.
  onStreamingEnd(container, callback) {
    if (!container) return;
    const DELAI_INACTIVITE_MS = 400;
    let minuteur = null;
    const observateur = new MutationObserver(() => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        const marque = container.querySelector('[data-is-streaming]');
        if (marque && marque.getAttribute('data-is-streaming') === 'true') return;
        callback();
      }, DELAI_INACTIVITE_MS);
    });
    observateur.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-is-streaming'],
    });
  },
};
