// Restauration à la réception (M-07 / UC-002, fail-closed) — voir
// docs/SPECS.md. Mécanisme DOM uniquement (pas de hook réseau, voir
// ADR-007) : le marquage pendant le streaming est du best-effort (chaque
// tag [TYP:CODE] complet est enveloppé dans un span stylisé, tag brut
// laissé visible, infobulle au survol montrant le nom réel déjà résolu) ;
// seule la substitution finale, une fois la réponse stable, est garantie
// (contenu du span remplacé par le nom réel, tag d'origine conservé en
// data-* pour une infobulle inversée).
window.fogbankReception = (function () {
  const DELAI_INFOBULLE_MS = 150;

  let elementInfobulle = null;
  let minuteurInfobulle = null;

  function afficherInfobulle(span, texte) {
    clearTimeout(minuteurInfobulle);
    minuteurInfobulle = setTimeout(() => {
      if (!elementInfobulle) {
        elementInfobulle = document.createElement('div');
        elementInfobulle.className = 'fogbank-infobulle';
        Object.assign(elementInfobulle.style, {
          position: 'fixed',
          zIndex: '2147483647',
          background: '#222',
          color: '#fff',
          padding: '3px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        });
        document.body.appendChild(elementInfobulle);
      }
      elementInfobulle.textContent = texte;
      const rect = span.getBoundingClientRect();
      elementInfobulle.style.left = `${rect.left}px`;
      elementInfobulle.style.top = `${rect.bottom + 4}px`;
      elementInfobulle.style.display = 'block';
    }, DELAI_INFOBULLE_MS);
  }

  function masquerInfobulle() {
    clearTimeout(minuteurInfobulle);
    if (elementInfobulle) elementInfobulle.style.display = 'none';
  }

  function styliser(span, estInconnu) {
    Object.assign(span.style, {
      textDecoration: 'underline',
      textDecorationColor: estInconnu ? '#d33' : '#2d6cdf',
      textDecorationStyle: estInconnu ? 'dotted' : 'solid',
      textDecorationThickness: '2px',
      cursor: 'default',
    });
  }

  function texteInfobulle(span) {
    if (span.dataset.fogbankInconnu === 'true') return 'Pseudonyme inconnu';
    // Phase 2 (déjà substitué) : survol montre le tag d'origine reçu.
    // Phase 1 : survol montre le nom réel déjà résolu.
    return span.dataset.fogbankTag || span.dataset.fogbankNom;
  }

  function creerSpanTag(type, code, tagComplet, resoudre) {
    const entite = resoudre(type, code);
    const span = document.createElement('span');
    span.dataset.fogbankType = type;
    span.dataset.fogbankCode = code;
    span.textContent = tagComplet; // phase 1 : le tag brut reste visible

    if (entite) {
      span.dataset.fogbankNom = entite.nomReel;
      styliser(span, false);
    } else {
      // Tag inconnu (annuaire modifié entre-temps, ou tag halluciné) — voir
      // docs/SPECS.md, UC-002, Cas d'erreur. Pas de remplacement en phase 2.
      span.dataset.fogbankInconnu = 'true';
      styliser(span, true);
    }
    span.addEventListener('mouseenter', () => afficherInfobulle(span, texteInfobulle(span)));
    span.addEventListener('mouseleave', masquerInfobulle);
    return span;
  }

  // Découpe un nœud texte en segments (texte brut / span marqué) dès qu'un
  // tag complet y est détecté. Ignore silencieusement les tags partiels
  // (pas de crochet fermant) : ils seront repris à la prochaine mutation
  // une fois complets (voir Contraintes de l'UC).
  function marquerTagsDansNoeud(noeud, resoudre) {
    const texte = noeud.textContent;
    const parent = noeud.parentNode;
    if (!parent) return;

    // Regex partagée (docs/SPECS.md) — une factory plutôt qu'une constante
    // pour ne jamais partager le `lastIndex` mutable d'une regex globale
    // entre appels, y compris imbriqués (voir pseudonyme.js).
    const regex = window.fogbankPseudonyme.creerRegexTag();
    let correspondance = regex.exec(texte);
    if (!correspondance) return;

    const fragment = document.createDocumentFragment();
    let dernierIndex = 0;
    while (correspondance) {
      const [tagComplet, type, code] = correspondance;
      if (correspondance.index > dernierIndex) {
        fragment.appendChild(document.createTextNode(texte.slice(dernierIndex, correspondance.index)));
      }
      fragment.appendChild(creerSpanTag(type, code, tagComplet, resoudre));
      dernierIndex = correspondance.index + tagComplet.length;
      correspondance = regex.exec(texte);
    }
    if (dernierIndex < texte.length) {
      fragment.appendChild(document.createTextNode(texte.slice(dernierIndex)));
    }
    parent.replaceChild(fragment, noeud);
  }

  function detenteurDejaMarque(noeudTexte) {
    return !!(noeudTexte.parentElement && noeudTexte.parentElement.closest('[data-fogbank-code]'));
  }

  // Traite un nœud ajouté par une mutation (ou le conteneur lui-même lors
  // du passage initial) : marque tous les tags complets trouvés dans son
  // sous-arbre, en ignorant ce qui appartient déjà à un span fogbank.
  function traiterNoeudAjoute(noeud, resoudre) {
    if (noeud.nodeType === Node.TEXT_NODE) {
      if (!detenteurDejaMarque(noeud)) marquerTagsDansNoeud(noeud, resoudre);
      return;
    }
    if (noeud.nodeType !== Node.ELEMENT_NODE) return;
    if (noeud.closest('[data-fogbank-code]')) return;

    const marcheur = document.createTreeWalker(noeud, NodeFilter.SHOW_TEXT);
    const noeudsTexte = [];
    let n = marcheur.nextNode();
    while (n) {
      noeudsTexte.push(n);
      n = marcheur.nextNode();
    }
    noeudsTexte.forEach((noeudTexte) => {
      if (!detenteurDejaMarque(noeudTexte)) marquerTagsDansNoeud(noeudTexte, resoudre);
    });
  }

  // Phase 2 : substitution finale, un seul passage (voir Contraintes,
  // Performance). Les tags inconnus (Cas d'erreur) ne sont jamais substitués.
  function substituerNomsReels(container) {
    const spans = container.querySelectorAll('span[data-fogbank-code]:not([data-fogbank-inconnu])');
    spans.forEach((span) => {
      if (span.dataset.fogbankTag) return; // déjà substitué
      span.dataset.fogbankTag = `[${span.dataset.fogbankType}:${span.dataset.fogbankCode}]`;
      span.textContent = span.dataset.fogbankNom;
    });
  }

  // Observe la zone de réponse d'un adaptateur actif et déclenche les deux
  // phases de UC-002. `resoudre(type, code)` doit renvoyer l'entité de
  // l'annuaire correspondante ou null (voir fogbankPseudonyme.resoudreEntite).
  function observer(container, adaptateur, resoudre) {
    if (!container) return;

    const observateur = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          traiterNoeudAjoute(mutation.target, resoudre);
        } else if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((noeud) => traiterNoeudAjoute(noeud, resoudre));
        }
      });
    });
    observateur.observe(container, { childList: true, subtree: true, characterData: true });

    // Passage initial : couvre le cas d'une réponse déjà entièrement
    // présente au moment de l'attache (rechargement de page, conversation
    // déjà rendue — voir docs/SPECS.md UC-002, Contraintes). Comme aucune
    // mutation ne se produit dans ce cas, l'inactivité du MutationObserver
    // ci-dessus ne se déclencherait jamais toute seule : la substitution
    // finale est donc aussi lancée ici, pas seulement le marquage
    // best-effort, sans attendre un hypothétique onStreamingEnd.
    traiterNoeudAjoute(container, resoudre);
    substituerNomsReels(container);

    if (typeof adaptateur.onStreamingEnd === 'function') {
      adaptateur.onStreamingEnd(container, () => substituerNomsReels(container));
    }
  }

  return { observer };
})();
