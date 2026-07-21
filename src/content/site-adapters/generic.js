// Adaptateur générique (fallback) pour un site sans adaptateur dédié.
// Heuristiques volontairement simples : premier champ contenteditable de
// la page, et le premier bouton qui le suit dans l'ordre du document.
// UC-001 se limite au contenteditable (voir docs/SPECS.md, UC-001).
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
};
