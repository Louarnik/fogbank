// Fabrique de bouton partagée entre options.js (boutons texte de colonne
// « actions ») et sidepanel.js (boutons icône des bulles d'historique) —
// même squelette (type, classe, contenu, listener), seul le contenu diffère
// (texte visible vs icône + title/aria-label).
window.fogbankDomUtils = (function () {
  function creerBouton({ texte, html, classe, titre, onClick }) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = classe;
    if (texte !== undefined) bouton.textContent = texte;
    if (html !== undefined) bouton.innerHTML = html;
    if (titre) {
      bouton.title = titre;
      bouton.setAttribute('aria-label', titre);
    }
    bouton.addEventListener('click', onClick);
    return bouton;
  }

  return { creerBouton };
})();
