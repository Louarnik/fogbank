// Adaptateur générique — seul adaptateur chargé pour l'instant (voir
// docs/ARCHITECTURE.md, § Travail restant). Les adaptateurs dédiés
// (chatgpt.js, claude.js, sélecteurs exacts ou proximité du bouton d'envoi)
// se sont révélés trop fragiles sur les vrais sites (voir bugs.md) : plutôt
// que deviner OÙ se trouve le composer ou la zone de réponse, la détection
// de zone de réponse est abandonnée entièrement — reception.js scanne toute
// la page à la place (voir content.js). Ce fichier ne garde donc que la
// détection des champs de saisie.
window.fogbankGenericAdapter = {
  matches() {
    return true;
  },

  // « Partout où on peut saisir du texte » : tout contenteditable/textarea
  // de la page, hors un panneau de contrôle replié (<details> non ouvert —
  // jamais un composer actif).
  getInputFields() {
    const candidats = Array.from(
      document.querySelectorAll('[contenteditable="true"], textarea')
    );
    return candidats.filter((el) => !el.closest('details:not([open])'));
  },
};
