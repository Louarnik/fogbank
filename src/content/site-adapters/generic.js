// Adaptateur générique (fallback) pour un site sans adaptateur dédié.
// Heuristiques volontairement simples. Fail-closed (ADR-007, voir
// docs/SPECS.md UC-001) : couvre `<textarea>` et `contenteditable`
// indifféremment (l'EditorHandle unifie les deux), pas seulement
// contenteditable comme dans l'ancienne version fail-open.
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

  // Un site réel n'a qu'un seul composer ; ce repli générique en supporte
  // plusieurs indépendamment (utile notamment pour la fixture de test, qui
  // présente un scénario <textarea> et un scénario contenteditable sur la
  // même page). Exclut les champs dans un <details> non ouvert : un panneau
  // de contrôle replié n'est pas un composer actif (heuristique volontaire,
  // pas seulement pour la fixture — un vrai composer de chat n'est jamais
  // caché dans une divulgation repliée).
  getInputFields() {
    const candidats = Array.from(
      document.querySelectorAll('[contenteditable="true"], textarea')
    );
    return candidats.filter((el) => !el.closest('details:not([open])'));
  },

  getSendTrigger(champ) {
    const boutons = Array.from(document.querySelectorAll('button'));
    return (
      boutons.find(
        (b) =>
          champ.compareDocumentPosition(b) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ) || null
    );
  },

  // Heuristique : en partant du bouton d'envoi de ce champ, cherche le
  // premier élément qui le suit dans le document et qui ne contient
  // lui-même aucun contrôle de saisie (bouton, champ...) — ce qui exclut
  // aussi bien le bouton d'envoi que d'éventuels panneaux de contrôle
  // placés après la zone de réponse. Si le bouton n'a pas de frère
  // exploitable (parce qu'il est lui-même imbriqué dans un conteneur du
  // composer — barre d'actions, fieldset — aux côtés d'autres contrôles),
  // remonte d'un niveau et recommence : la zone de réponse est alors une
  // sœur de ce conteneur, pas du bouton lui-même.
  getResponseContainer(champ) {
    let ancre = this.getSendTrigger(champ);
    while (ancre && ancre !== document.body) {
      let element = ancre.nextElementSibling;
      while (element) {
        if (!element.querySelector('button, textarea, input, [contenteditable="true"]')) {
          return element;
        }
        element = element.nextElementSibling;
      }
      ancre = ancre.parentElement;
    }
    return null;
  },

  isStreaming(container) {
    return !!container && container.dataset.fogbankStreamingActif === 'true';
  },

  // Repli générique par délai d'inactivité (voir en-tête de fichier) :
  // callback rappelé à chaque fin de rafale de mutations, pas seulement la
  // première fois — une conversation reçoit plusieurs réponses au fil du
  // temps, chacune doit déclencher sa propre substitution finale (UC-002).
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
