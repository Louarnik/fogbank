// Correspondance site/URL partagée entre content.js (détermine le site
// courant pour charger annuaire/config) et popup.js (affiche le statut du
// site de l'onglet actif) — une seule implémentation pour éviter que les
// deux dérivent l'une de l'autre.
window.fogbankSiteMatching = (function () {
  function correspond(site, href) {
    const motif = site.domaine.replace(/^file:\/\//, '');
    return href.includes(motif);
  }

  // Utilisé par content.js : seulement un site actif peut être « le » site
  // courant.
  function trouverSiteActifPour(sites, href) {
    return sites.find((s) => s.actif && correspond(s, href)) || null;
  }

  // Utilisé par popup.js : y compris un site désactivé, pour proposer de le
  // réactiver plutôt que d'afficher « site non reconnu » à tort.
  function trouverSiteConfigurePour(sites, href) {
    return sites.find((s) => correspond(s, href)) || null;
  }

  return { correspond, trouverSiteActifPour, trouverSiteConfigurePour };
})();
