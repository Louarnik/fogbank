// Aide générique lecture-mutation-écriture pour chrome.storage.local, pour
// remplacer le pattern get → mutate → set répété tel quel dans options.js
// (annuaire, sites) et sidepanel.js (site actif).
window.fogbankStorage = (function () {
  async function mettreAJourListe(cle, mutateur) {
    const donnees = await chrome.storage.local.get([cle]);
    const actuel = donnees[cle] || [];
    mutateur(actuel);
    await chrome.storage.local.set({ [cle]: actuel });
    return actuel;
  }

  return { mettreAJourListe };
})();
