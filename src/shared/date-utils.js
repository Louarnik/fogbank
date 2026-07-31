// Utilitaires de date partagés entre les pages classiques (sidepanel.js,
// options.js) — background.js tourne en service worker de type "module" et
// garde sa propre copie triviale, même contrainte que shared/site-matching.js
// (voir sa note d'en-tête).
window.fogbankDateUtils = (function () {
  function aujourdHuiISO() {
    return new Date().toISOString().slice(0, 10);
  }

  return { aujourdHuiISO };
})();
