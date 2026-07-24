// Profils de lecture par tour (voir ADR-011, UC-002 révisé) — best-effort,
// **lecture seule**, jamais utilisés pour écrire. Contrairement au contrat
// d'adaptateur de site abandonné par ADR-008 (getInputFields,
// getResponseContainer... pour l'écriture, où trois échecs successifs ont
// justifié l'abandon), un sélecteur qui se trompe ici n'a aucune
// conséquence sur le site : au pire, `obtenirTours` renvoie `null` et
// l'appelant se rabat sur le bloc de texte unique (comportement déjà
// existant d'UC-002 avant ADR-011).
window.fogbankProfilsLecture = (function () {
  const PROFILS = [
    {
      nom: 'claude',
      correspond: (h) => /(^|\.)claude\.ai$/.test(h),
      selecteur: '[data-testid="user-message"], .font-claude-response',
      // Sélecteurs relevés sur le vrai Claude.ai (voir
      // tests/fixtures/mock-claude-site/) — non revérifiés en direct à
      // chaque release, voir ADR-011.
      role(el) {
        return el.matches('[data-testid="user-message"]') ? 'utilisateur' : 'assistant';
      },
    },
    {
      nom: 'chatgpt',
      correspond: (h) => /(^|\.)chatgpt\.com$/.test(h) || /(^|\.)chat\.openai\.com$/.test(h),
      selecteur: '[data-message-author-role]',
      // Attribut public et documenté par ailleurs, mais jamais vérifié
      // contre une fixture locale (pas de mock-chatgpt-site dédiée) — à
      // valider contre le vrai site avant de considérer ce profil acquis.
      role(el) {
        return el.getAttribute('data-message-author-role') === 'user' ? 'utilisateur' : 'assistant';
      },
    },
    {
      nom: 'copilot',
      correspond: (h) => /(^|\.)copilot\.microsoft\.com$/.test(h),
      selecteur: '[data-content="user-message"], [data-content="ai-message"]',
      // Sélecteurs relevés sur le vrai Copilot grand public (voir
      // tests/fixtures/mock-copilot-site/).
      role(el) {
        return el.getAttribute('data-content') === 'user-message' ? 'utilisateur' : 'assistant';
      },
    },
  ];

  function profilPour(hostname) {
    return PROFILS.find((p) => p.correspond(hostname)) || null;
  }

  // Même exclusion que le scan générique (voir ecriture.js) : un champ de
  // saisie capturé par erreur dans un tour n'a pas de sens.
  function texteVisible(el) {
    const marcheur = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let texte = '';
    let n = marcheur.nextNode();
    while (n) {
      const horsPortee = n.parentElement && n.parentElement.closest('[contenteditable="true"], textarea');
      if (!horsPortee) texte += n.textContent;
      n = marcheur.nextNode();
    }
    return texte.trim();
  }

  // Renvoie `null` si aucun profil ne correspond au site, ou si le profil
  // correspond mais ne trouve aucun élément (structure du site changée) —
  // dans les deux cas, l'appelant doit se rabattre sur le bloc de texte
  // unique, jamais échouer silencieusement.
  function obtenirTours(hostname) {
    const profil = profilPour(hostname);
    if (!profil) return null;
    const elements = Array.from(document.querySelectorAll(profil.selecteur));
    if (elements.length === 0) return null;
    return elements.map((el, index) => ({
      index,
      role: profil.role(el),
      texte: texteVisible(el),
    }));
  }

  // Localisation d'un tour précis (voir UC-002, action « localiser » par
  // bulle) : re-requête le même sélecteur au moment du clic plutôt que de
  // garder une référence DOM vivante — plus robuste si la page a bougé
  // entre la lecture et le clic, au prix de supposer un ordre stable.
  // Renvoie l'élément (laisse ecriture.js gérer scroll/flash, comme pour
  // localiserTexte) plutôt que de dupliquer cette logique ici.
  function obtenirElementTour(hostname, index) {
    const profil = profilPour(hostname);
    if (!profil) return null;
    const elements = document.querySelectorAll(profil.selecteur);
    return elements[index] || null;
  }

  return { obtenirTours, obtenirElementTour };
})();
