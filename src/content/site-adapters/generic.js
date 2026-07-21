// Adaptateur générique (fallback) pour un site sans adaptateur dédié.
// Heuristiques volontairement simples : premier champ contenteditable de
// la page, et le premier bouton qui le suit dans l'ordre du document.
// UC-001 se limite au contenteditable (voir docs/SPECS.md, UC-001).
//
// UC-002 (restauration à la réception) ajoute getResponseContainer et le
// couple isStreaming/onStreamingEnd. Contrairement à un adaptateur dédié
// (qui viserait un élément précis du site — bouton "regénérer", disparition
// d'un curseur...), le repli générique n'a aucun signal DOM spécifique à
// détecter : la fin du streaming est déduite par délai d'inactivité du
// MutationObserver sur la zone de réponse (voir docs/ARCHITECTURE.md).
const FOGBANK_DELAI_INACTIVITE_MS = 400;

window.fogbankGenericAdapter = {
  matches() {
    return true;
  },

  getInputField() {
    return document.querySelector('[contenteditable="true"]');
  },

  getSendTrigger() {
    const champ = this.getInputField();
    if (!champ) return null;
    const boutons = Array.from(document.querySelectorAll('button'));
    return (
      boutons.find(
        (b) =>
          champ.compareDocumentPosition(b) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) || null
    );
  },

  // Heuristique : le premier élément qui suit le bouton d'envoi dans le
  // document et qui ne contient lui-même aucun contrôle de saisie (bouton,
  // champ...) — ce qui exclut aussi bien le bouton d'envoi que d'éventuels
  // panneaux de contrôle placés après la zone de réponse.
  // TODO(debug demain) : heuristique non vérifiée en vrai navigateur — à
  // rejouer contre le Scénario B de la fixture (vérifier qu'elle retombe
  // bien sur .zone-reponse et pas sur le panneau payload-log juste après).
  getResponseContainer() {
    const bouton = this.getSendTrigger();
    if (!bouton) return null;
    let element = bouton.nextElementSibling;
    while (element) {
      if (!element.querySelector('button, textarea, input, [contenteditable="true"]')) {
        return element;
      }
      element = element.nextElementSibling;
    }
    return null;
  },

  isStreaming(container) {
    return !!container && container.dataset.fogbankStreamingActif === 'true';
  },

  // Repli générique par délai d'inactivité (voir en-tête de fichier) :
  // callback rappelé à chaque fin de rafale de mutations, pas seulement la
  // première fois — une conversation reçoit plusieurs réponses au fil du
  // temps, chacune doit déclencher sa propre phase 2 (UC-002).
  onStreamingEnd(container, callback) {
    if (!container) return;
    let minuteur = null;
    let enCours = false;
    const observateur = new MutationObserver(() => {
      enCours = true;
      container.dataset.fogbankStreamingActif = 'true';
      clearTimeout(minuteur);
      minuteur = setTimeout(() => {
        if (!enCours) return;
        enCours = false;
        delete container.dataset.fogbankStreamingActif;
        callback();
      }, FOGBANK_DELAI_INACTIVITE_MS);
    });
    observateur.observe(container, { childList: true, subtree: true, characterData: true });
  },
};
