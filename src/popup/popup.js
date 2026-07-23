// Popup — statut du site courant, accès rapide au side panel (surface
// principale, voir ADR-008) et aux deux CRUD de la page d'options. Voir
// docs/ARCHITECTURE.md.
document.addEventListener('DOMContentLoaded', async () => {
  const statutSite = document.getElementById('statut-site');
  const boutonToggleSite = document.getElementById('bouton-toggle-site');
  const boutonPanneau = document.getElementById('bouton-panneau');

  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true });
  const donnees = await chrome.storage.local.get(['fogbank.sites']);
  const sites = donnees['fogbank.sites'] || [];
  const site =
    onglet && onglet.url
      ? window.fogbankSiteMatching.trouverSiteConfigurePour(sites, onglet.url)
      : null;

  if (!site) {
    statutSite.textContent = 'Site non reconnu par fogbank.';
  } else {
    statutSite.textContent = site.actif
      ? `Actif sur ${site.domaine}`
      : `Désactivé sur ${site.domaine}`;
    boutonToggleSite.textContent = site.actif ? 'Désactiver sur ce site' : 'Activer sur ce site';
    boutonToggleSite.hidden = false;
    boutonToggleSite.addEventListener('click', async () => {
      // Prend effet à la prochaine exécution de content/ecriture.js :
      // celui-ci ne relit fogbank.sites qu'à son chargement, d'où le
      // rechargement de l'onglet.
      site.actif = !site.actif;
      await chrome.storage.local.set({ 'fogbank.sites': sites });
      if (onglet && onglet.id) chrome.tabs.reload(onglet.id);
      window.close();
    });
  }

  boutonPanneau.addEventListener('click', () => {
    // Doit rester le tout premier appel, synchrone, dans le geste
    // utilisateur (voir background.js) — un await avant lui ferait perdre
    // le contexte de geste exigé par l'API.
    if (onglet && onglet.id) {
      chrome.sidePanel.open({ tabId: onglet.id }).catch((err) => {
        console.error('[fogbank] échec d’ouverture du side panel :', err);
      });
    }
    window.close();
  });

  document.getElementById('bouton-annuaire').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('bouton-sites').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#sites') });
  });
});
