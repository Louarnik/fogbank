// Service worker de l'extension (Manifest V3).
// Point de départ minimal : log au démarrage pour valider que le
// service worker est bien enregistré et exécuté par Chrome.
chrome.runtime.onInstalled.addListener(() => {
  console.log('[fogbank] extension installée.');
});
