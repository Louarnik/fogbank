// Adaptateur dédié — ChatGPT (chatgpt.com). Sélecteurs exacts relevés dans
// docs/recherche/constat-chatgpt.md (non vérifiés en direct au moment de
// l'écriture — à reconfirmer avec la sonde du §8 de ce document si le
// comportement dévie). Remplace le repli générique (site-adapters/generic.js)
// dont les heuristiques par position DOM (premier bouton après le champ...)
// sont trop fragiles face à la vraie barre d'outils du composer (pièce
// jointe, sélecteur de modèle... avant le bouton d'envoi).
window.fogbankChatgptAdapter = {
  matches() {
    return /(^|\.)chatgpt\.com$/.test(location.hostname);
  },

  // #prompt-textarea est l'id conservé du <textarea> historique, posé
  // aujourd'hui sur le div ProseMirror qui l'a remplacé (constat, §2.1) —
  // un seul composer par page.
  getInputFields() {
    const champ = document.querySelector('#prompt-textarea');
    return champ ? [champ] : [];
  },

  // #thread porte tous les tours de conversation (utilisateur + assistant) :
  // une seule zone de réponse pour tout le fil.
  getResponseContainer() {
    return document.querySelector('#thread');
  },

  // Le bouton d'envoi bascule entre data-testid="send-button" et
  // "stop-button" selon l'état (constat, §2.2) : présence du second =
  // génération en cours, l'indicateur le plus fiable côté DOM du site.
  isStreaming() {
    return !!document.querySelector('[data-testid="stop-button"]');
  },

  // Repose sur la disparition du bouton stop plutôt que sur la seule
  // inactivité du MutationObserver (comportement du repli générique) : le
  // flux SSE peut marquer une pause de plusieurs centaines de ms sans que
  // la génération soit terminée (constat, §4.3 — virtualisation CodeMirror
  // des blocs de code), ce qui déclencherait sinon une substitution
  // prématurée.
  onStreamingEnd(container, callback) {
    if (!container) return;
    let enCours = !!document.querySelector('[data-testid="stop-button"]');
    const observateur = new MutationObserver(() => {
      const maintenant = !!document.querySelector('[data-testid="stop-button"]');
      if (maintenant) {
        enCours = true;
        return;
      }
      if (enCours) {
        enCours = false;
        callback();
      }
    });
    // childList+subtree sur <body> : le bouton d'envoi est en dehors de
    // #thread (barre du composer), donc hors du sous-arbre observable
    // depuis la seule zone de réponse.
    observateur.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-testid'],
    });
  },
};
