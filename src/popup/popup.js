// Popup — statut du site courant, pause temporaire, accès aux deux CRUD de
// la page d'options (annuaire des entités, annuaire des sites). Voir
// docs/ARCHITECTURE.md.
document.addEventListener('DOMContentLoaded', async () => {
  const statutSite = document.getElementById('statut-site');
  const boutonToggleSite = document.getElementById('bouton-toggle-site');
  const boutonPause = document.getElementById('bouton-pause');

  const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true });
  const donnees = await chrome.storage.local.get(['fogbank.sites', 'fogbank.pause']);
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
      // Prend effet à la prochaine exécution du content script : celui-ci
      // ne relit fogbank.sites qu'à son chargement (voir content.js), d'où
      // le rechargement de l'onglet — contrairement à la pause temporaire
      // ci-dessous, qui n'en a pas besoin.
      site.actif = !site.actif;
      await chrome.storage.local.set({ 'fogbank.sites': sites });
      if (onglet && onglet.id) chrome.tabs.reload(onglet.id);
      window.close();
    });
  }

  let enPause = !!donnees['fogbank.pause'];
  function rendrePause() {
    boutonPause.textContent = enPause ? 'Reprendre' : 'Mettre en pause';
  }
  rendrePause();
  boutonPause.addEventListener('click', async () => {
    enPause = !enPause;
    await chrome.storage.local.set({ 'fogbank.pause': enPause });
    rendrePause();
  });

  document.getElementById('bouton-annuaire').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('bouton-sites').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#sites') });
  });
});
