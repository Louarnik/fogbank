// Restauration à la réception (M-07 / UC-002, fail-closed) — voir
// docs/SPECS.md. Approche « hyper robuste » adoptée après échec des
// adaptateurs dédiés sur les vrais sites (Claude.ai, ChatGPT — voir
// bugs.md et docs/ARCHITECTURE.md, § Travail restant) : plutôt que deviner
// OÙ chercher la réponse (sélecteur exact d'un site, proximité du bouton
// d'envoi...), on scanne TOUT le texte de la page à chaque fois qu'elle a
// cessé de bouger (voir content.js, seul appelant de `traiterPage`) et on
// traite chaque tag [TYP:CODE] complet trouvé, où qu'il soit — sauf dans un
// champ de saisie actif, jamais touché (R-31 : le tag y reste tel quel,
// seul fogbankDisplay le décore, en overlay, sans jamais écrire dans son DOM).
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

  // Hors de portée du scan page entière : un champ de saisie actif (jamais
  // touché, voir en-tête de fichier) et notre propre UI flottante
  // (mention-menu, infobulle ci-dessus) — celle-ci est ajoutée directement
  // à document.body, donc visible du TreeWalker de `traiterPage` si on ne
  // l'exclut pas explicitement (fogbankDisplay, lui, vit dans une racine
  // shadow DOM fermée, déjà hors de portée du DOM léger sans exclusion
  // particulière).
  function horsPortee(noeud) {
    const ancetre = noeud.parentElement;
    if (!ancetre) return true;
    return !!ancetre.closest(
      '[contenteditable="true"], textarea, .fogbank-mention-menu, .fogbank-infobulle'
    );
  }

  function creerSpanTag(type, code, resoudre) {
    const entite = resoudre(type, code);
    const span = document.createElement('span');
    span.dataset.fogbankCode = code;
    span.dataset.fogbankTag = `[${type}:${code}]`;

    if (entite) {
      span.textContent = entite.nomReel;
      styliser(span, false);
    } else {
      // Tag inconnu (annuaire modifié entre-temps, ou tag halluciné) — voir
      // docs/SPECS.md, UC-002, Cas d'erreur. Rien à substituer : le tag
      // reste visible tel quel, seul le style change pour signaler l'échec.
      span.dataset.fogbankInconnu = 'true';
      span.textContent = span.dataset.fogbankTag;
      styliser(span, true);
    }
    span.addEventListener('mouseenter', () => afficherInfobulle(span, span.dataset.fogbankTag));
    span.addEventListener('mouseleave', masquerInfobulle);
    return span;
  }

  // Découpe un nœud texte en segments (texte brut / span substitué) dès
  // qu'un tag complet y est détecté. Ignore silencieusement les tags
  // partiels (pas de crochet fermant) : ils seront repris à la prochaine
  // stabilisation, une fois complets.
  function marquerNoeudTexte(noeud, resoudre) {
    if (horsPortee(noeud)) return;
    if (noeud.parentElement.closest('[data-fogbank-code]')) return; // déjà traité

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
      fragment.appendChild(creerSpanTag(type, code, resoudre));
      dernierIndex = correspondance.index + tagComplet.length;
      correspondance = regex.exec(texte);
    }
    if (dernierIndex < texte.length) {
      fragment.appendChild(document.createTextNode(texte.slice(dernierIndex)));
    }
    parent.replaceChild(fragment, noeud);
  }

  // Parcourt tout le sous-arbre texte de `racine` (document.body en usage
  // normal, voir content.js) et traite chaque tag complet trouvé. Rejoué en
  // entier à chaque stabilisation de la page plutôt qu'une seule fois : un
  // passage sur les nœuds texte reste négligeable même sur une conversation
  // longue, et c'est précisément ce qui rend le mécanisme robuste face à un
  // site dont on ne connaît pas la structure exacte (pas de conteneur à
  // identifier, pas de signal de fin de streaming à deviner).
  function traiterPage(racine, resoudre) {
    const cible = racine || document.body;
    const marcheur = document.createTreeWalker(cible, NodeFilter.SHOW_TEXT);
    const noeudsTexte = [];
    let n = marcheur.nextNode();
    while (n) {
      noeudsTexte.push(n);
      n = marcheur.nextNode();
    }
    noeudsTexte.forEach((noeud) => marquerNoeudTexte(noeud, resoudre));
  }

  return { traiterPage };
})();
