// Seul content script de production (voir ADR-008, ADR-009). Cinq
// responsabilités, toutes pilotées par messages depuis le side panel ou
// le menu contextuel :
// - Ciblage (M-15) : mémoriser un champ désigné par clic droit, persister
//   un descripteur par site, tenter de le retrouver au chargement suivant.
// - Écrasement (M-16) : remplacer tout le contenu du champ ciblé —
//   jamais une insertion au curseur.
// - Lecture (M-07) : extraire le texte visible de la page (hors champs de
//   saisie) une fois qu'elle a cessé de bouger, pour affichage résolu côté
//   panneau — aucune écriture dans le DOM du site.
// - Modification externe (M-16, panneau maître) : détecter qu'un champ
//   ciblé a changé sans que ce soit fogbank qui l'ait écrit, et le
//   signaler plutôt que de l'écraser silencieusement au prochain cycle.
// - Localisation (voir SPECS.md, § Ergonomie) : retrouver sur la page un
//   texte affiché dans le panneau, aller simple (scroll + surbrillance),
//   pas une navigation synchronisée.
(async function () {
  const siteMatching = window.fogbankSiteMatching;

  let sites = [];
  let siteCourant = null;

  async function chargerSites() {
    const donnees = await chrome.storage.local.get(['fogbank.sites']);
    sites = donnees['fogbank.sites'] || [];
    siteCourant = siteMatching.trouverSiteActifPour(sites, location.href);
  }
  await chargerSites();

  chrome.storage.onChanged.addListener((changements, zone) => {
    if (zone === 'local' && changements['fogbank.sites']) {
      sites = changements['fogbank.sites'].newValue || [];
      siteCourant = siteMatching.trouverSiteActifPour(sites, location.href);
    }
  });

  let cibleActuelle = null;
  let dernierEcritPar = null; // dernier contenu écrit par fogbank — sert à distinguer une modification externe
  let observateurCible = null;

  function decrireCible(el) {
    if (!el) return null;
    return {
      tag: el.tagName,
      id: el.id || null,
      classe: (el.className && String(el.className)) || null,
      placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || null,
      contentEditable: !!el.isContentEditable,
    };
  }

  // Descripteur de persistance (M-15) — distinct de decrireCible ci-dessus
  // (affichage) : sert à retrouver le champ, pas à le décrire à l'utilisateur.
  function calculerDescripteur(el) {
    return {
      id: el.id || null,
      tag: el.tagName,
      role: el.getAttribute('role') || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      placeholder: el.getAttribute('placeholder') || el.getAttribute('data-placeholder') || null,
    };
  }

  function retrouverParDescripteur(descripteur) {
    if (!descripteur) return null;
    if (descripteur.id) {
      const parId = document.getElementById(descripteur.id);
      if (parId) return parId;
    }
    const candidats = Array.from(document.querySelectorAll('[contenteditable="true"], textarea'));
    return (
      candidats.find(
        (el) =>
          el.tagName === descripteur.tag &&
          ((descripteur.ariaLabel && el.getAttribute('aria-label') === descripteur.ariaLabel) ||
            (descripteur.placeholder &&
              (el.getAttribute('placeholder') || el.getAttribute('data-placeholder')) ===
                descripteur.placeholder))
      ) || null
    );
  }

  // Flash plutôt que contour permanent — confirmation visuelle du ciblage
  // sans rester intrusif sur un vrai site pour le reste de la session.
  function flashCible(el) {
    if (!el) return;
    el.style.outline = '3px solid #2d6cdf';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }, 1200);
  }

  function lireContenu(el) {
    return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.textContent;
  }

  function surModificationChamp() {
    if (!cibleActuelle) return;
    const contenu = lireContenu(cibleActuelle);
    if (contenu !== dernierEcritPar) {
      chrome.runtime.sendMessage({ type: 'fogbank:modification-externe', contenu }).catch(() => {});
    }
  }

  function definirCible(el) {
    if (observateurCible && cibleActuelle) {
      cibleActuelle.removeEventListener('input', observateurCible);
    }
    cibleActuelle = el;
    dernierEcritPar = el ? lireContenu(el) : null;
    observateurCible = el ? surModificationChamp : null;
    if (el) el.addEventListener('input', observateurCible);
  }

  // Relit fogbank.sites au moment même de l'écriture plutôt que de se fier
  // à `siteCourant` (calculé au chargement de la page, potentiellement
  // périmé) : background.js peut avoir créé le site l'instant d'avant
  // (voir UC-005, auto-création au clic droit) — s'appuyer sur le cache
  // local perdrait ce ciblage faute de correspondance encore connue.
  async function sauvegarderCiblePourSite(descripteur) {
    const donnees = await chrome.storage.local.get(['fogbank.sites']);
    const actuel = donnees['fogbank.sites'] || [];
    const site = siteMatching.trouverSiteActifPour(actuel, location.href);
    if (!site) return; // site non whitelisté : ciblage valable pour la session, non persisté
    const cible = actuel.find((s) => s.id === site.id);
    if (cible) {
      cible.cibleEcriture = descripteur;
      await chrome.storage.local.set({ 'fogbank.sites': actuel });
    }
  }

  // Auto-repérage (M-15) : retrouve au chargement le champ mémorisé pour ce
  // site, best-effort — un clic droit reste toujours possible en repli si
  // ça échoue (site restructuré, id changé...).
  if (siteCourant && siteCourant.cibleEcriture) {
    const trouve = retrouverParDescripteur(siteCourant.cibleEcriture);
    if (trouve) definirCible(trouve);
  }

  // Écrasement total (M-16) : sélectionne tout le contenu existant puis
  // remplace via execCommand, seul mécanisme observé qui traverse le
  // modèle interne d'un éditeur ProseMirror/Lexical (voir ADR-008).
  function ecraser(el, texte) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      el.select();
    } else {
      const plage = document.createRange();
      plage.selectNodeContents(el);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(plage);
    }
    dernierEcritPar = texte; // avant l'appel : l'event 'input' synchrone d'execCommand doit voir la bonne valeur
    const commandeAcceptee = document.execCommand('insertText', false, texte);
    const contenuFinal = lireContenu(el);
    dernierEcritPar = contenuFinal; // valeur réellement retenue par le site, pas nécessairement `texte`
    return { commandeAcceptee, contenuCorrespond: contenuFinal === texte, contenuFinal };
  }

  // Localiser (voir docs/SPECS.md, § Ergonomie) : aller simple vers la
  // première occurrence trouvée, pas une navigation synchronisée. V1
  // best-effort : cherche le texte tel quel (hors champs de saisie), donc
  // ne trouve rien pour un texte fourni sous sa forme résolue (nom réel)
  // si la page n'affiche que le tag brut — limite connue, voir SPECS.md.
  function localiserTexte(recherche) {
    if (!recherche) return false;
    const cible = recherche.trim().toLowerCase();
    if (!cible) return false;
    const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n = marcheur.nextNode();
    while (n) {
      const horsPortee = n.parentElement && n.parentElement.closest('[contenteditable="true"], textarea');
      if (!horsPortee && n.textContent.toLowerCase().includes(cible)) {
        const el = n.parentElement;
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          flashCible(el);
          return true;
        }
      }
      n = marcheur.nextNode();
    }
    return false;
  }

  // Lecture (M-07) : exclut tout champ de saisie actif (jamais capturé dans
  // le texte lu) et renvoie le texte brut au panneau plutôt que de
  // substituer dans le DOM du site — même scan que profils-lecture.js
  // (partagé via texteVisibleDe), appliqué ici à document.body entier.
  function texteVisibleHorsChamps() {
    return window.fogbankProfilsLecture.texteVisibleDe(document.body);
  }

  // Lecture par tour (voir ADR-011, UC-002 révisé) — `null` si aucun profil
  // de site ne correspond ou n'a rien trouvé : le panneau se rabat alors
  // sur `texteVisibleHorsChamps()` (bloc unique), toujours calculé en
  // parallèle pour ce repli et pour la vérification par sous-chaîne
  // (UC-005, insensible au découpage en tours).
  function toursConversation() {
    return window.fogbankProfilsLecture.obtenirTours(location.hostname);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return undefined;

    if (message.type === 'fogbank:cibler') {
      const el = document.activeElement === document.body ? null : document.activeElement;
      definirCible(el);
      flashCible(el);
      const descripteur = el ? calculerDescripteur(el) : null;
      sauvegarderCiblePourSite(descripteur);
      const cible = decrireCible(el);
      sendResponse({ ok: true, cible });
      chrome.runtime.sendMessage({ type: 'fogbank:cible-mise-a-jour', cible }).catch(() => {});
      return undefined;
    }

    if (message.type === 'fogbank:etat-cible') {
      sendResponse({ ok: true, cible: decrireCible(cibleActuelle) });
      return undefined;
    }

    if (message.type === 'fogbank:ecrire') {
      if (!cibleActuelle || !document.contains(cibleActuelle)) {
        sendResponse({ ok: false, erreur: 'Cible perdue (retirée du DOM, ou jamais définie).' });
        return undefined;
      }
      try {
        sendResponse({ ok: true, resultat: ecraser(cibleActuelle, message.texte) });
      } catch (err) {
        sendResponse({ ok: false, erreur: String(err) });
      }
      return undefined;
    }

    if (message.type === 'fogbank:lire-clair') {
      sendResponse({ ok: true, texte: texteVisibleHorsChamps(), tours: toursConversation() });
      return undefined;
    }

    if (message.type === 'fogbank:localiser') {
      sendResponse({ ok: localiserTexte(message.texte) });
      return undefined;
    }

    if (message.type === 'fogbank:localiser-tour') {
      const el = window.fogbankProfilsLecture.obtenirElementTour(location.hostname, message.index);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashCible(el);
      }
      sendResponse({ ok: !!el });
      return undefined;
    }

    return undefined;
  });

  // Réception (M-07) : diffusion de la page stabilisée pour affichage
  // panneau — voir UC-002. Un seul MutationObserver debouncé, aucun
  // conteneur de réponse à identifier.
  const DELAI_STABILITE_MS = 500;
  let minuteurStabilite = null;
  function planifierDiffusionStable() {
    clearTimeout(minuteurStabilite);
    minuteurStabilite = setTimeout(() => {
      chrome.runtime
        .sendMessage({
          type: 'fogbank:page-stable',
          texte: texteVisibleHorsChamps(),
          tours: toursConversation(),
        })
        .catch(() => {});
    }, DELAI_STABILITE_MS);
  }
  // Passage inconditionnel au chargement : couvre une page déjà rendue
  // (conversation relue) que le MutationObserver ne verrait jamais bouger.
  planifierDiffusionStable();
  new MutationObserver(planifierDiffusionStable).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
