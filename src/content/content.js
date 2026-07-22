// Point d'entrée du content script — fail-closed (ADR-007, voir
// docs/SPECS.md UC-001/UC-002). Charge l'annuaire/config depuis
// chrome.storage.local, détermine le site courant, puis :
// - câble l'insertion de tag (M-03/M-04) via un EditorHandle et le calque
//   de décoration (M-05) sur chaque champ de saisie détecté, avec rotation
//   paresseuse (M-08) au moment de l'insertion ; aucune substitution à
//   l'envoi (M-06 vestigial : le tag est déjà ce qui est inséré dans le
//   champ dès la sélection dans le menu, rien à réécrire plus tard) ;
// - restaure à la réception (M-07) en scannant tout le texte de la page
//   (voir reception.js), pas une zone de réponse identifiée par site.
//
// Les deux se déclenchent quand la page a cessé de bouger (voir
// « approche hyper robuste » ci-dessous) plutôt que de tenter d'identifier
// précisément un composer ou une zone de réponse par site — voir bugs.md et
// docs/ARCHITECTURE.md, § Travail restant, pour l'historique de ce choix.

(async function () {
  const DUREE_EN_JOURS = { '1s': 7, '1t': 91, '1a': 365 };

  const donnees = await chrome.storage.local.get([
    'fogbank.config',
    'fogbank.sites',
    'fogbank.annuaire',
  ]);
  const config = donnees['fogbank.config'] || { caractereDeclencheur: '&' };
  const sites = donnees['fogbank.sites'] || [];
  const annuaire = donnees['fogbank.annuaire'] || [];

  function siteCorrespond(site, href) {
    const motif = site.domaine.replace(/^file:\/\//, '');
    return href.includes(motif);
  }

  const siteCourant = sites.find((s) => s.actif && siteCorrespond(s, location.href));
  if (!siteCourant) {
    // Site non reconnu dans fogbank.sites : comportement natif inchangé
    // (voir docs/SPECS.md, UC-001, Cas d'erreur). Pas d'enforcement de
    // whitelist (M-01) à ce stade — voir ARCHITECTURE.md.
    return;
  }

  const adaptateur = window.fogbankGenericAdapter;

  function aujourdHuiISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function calculerExpiration(duree, depuisISO) {
    if (duree === 'infini' || !duree) return null;
    const jours = DUREE_EN_JOURS[duree] || 365;
    const date = new Date(depuisISO);
    date.setDate(date.getDate() + jours);
    return date.toISOString().slice(0, 10);
  }

  function persisterAnnuaire() {
    chrome.storage.local.set({ 'fogbank.annuaire': annuaire }).catch((err) => {
      console.error('[fogbank] échec de sauvegarde de l’annuaire :', err);
    });
  }

  // M-10 (génération) + M-08 (rotation paresseuse) : vérifié à chaque
  // insertion d'un tag — sans geste de substitution à l'envoi (fail-closed),
  // c'est le seul point d'ancrage retenu pour la rotation (voir UC-001,
  // Contraintes). Synchrone sur le cache en mémoire, persistance déclenchée
  // en arrière-plan.
  function obtenirOuCreerAlias(entite) {
    const aujourdHui = aujourdHuiISO();
    let entree = entite.aliasParSite.find((a) => a.siteId === siteCourant.id);

    if (entree && (entree.expireLe === null || entree.expireLe > aujourdHui)) {
      return entree.aliasActif;
    }

    const code = window.fogbankPseudonyme.genererCodeUnique(
      entite.nomReel,
      siteCourant.formatPseudonyme,
      entite.type,
      annuaire
    );
    const expireLe = calculerExpiration(siteCourant.dureeViePseudonyme, aujourdHui);

    if (!entree) {
      entree = { siteId: siteCourant.id, aliasActif: code, expireLe, historique: [] };
      entite.aliasParSite.push(entree);
    } else {
      entree.aliasActif = code;
      entree.expireLe = expireLe;
    }
    entree.historique.push({ alias: code, attribueLe: aujourdHui, expireLe });

    persisterAnnuaire();
    return code;
  }

  function rechercherEntites(filtre) {
    const f = filtre.toLowerCase();
    return annuaire.filter((e) => e.nomReel.toLowerCase().includes(f));
  }

  function resoudre(type, code) {
    return window.fogbankPseudonyme.resoudreEntite(annuaire, type, code);
  }

  function creerHandle(champ) {
    return champ.tagName === 'TEXTAREA'
      ? window.fogbankTextareaHandle.creer(champ)
      : window.fogbankContentEditableHandle.creer(champ);
  }

  // `champsTraites` évite de re-câbler un champ déjà traité à chaque
  // repassage (voir plus bas) — un composer React peut se monter après le
  // premier passage (ce content script ne s'exécute qu'une fois, à
  // document_idle), d'où le besoin de repasser plutôt que de tout câbler
  // une seule fois au chargement.
  const champsTraites = new WeakSet();

  // Isolation : un champ en échec (sélecteur inattendu, EditorHandle qui
  // lève...) ne doit pas empêcher le câblage des autres champs détectés
  // dans la même passe.
  function attacherChamp(champ) {
    try {
      const handle = creerHandle(champ);

      window.fogbankMentionMenu.attacher(champ, handle, {
        caractereDeclencheur: config.caractereDeclencheur || '&',
        rechercherEntites,
        obtenirOuCreerAlias,
        creerRegexTag: window.fogbankPseudonyme.creerRegexTag,
      });

      window.fogbankDisplay.attacher(champ, handle, { resoudre });
    } catch (err) {
      console.error('[fogbank] échec du câblage d’un champ, les autres champs ne sont pas affectés :', err);
    }
  }

  function traiterChamps() {
    const champs = adaptateur.getInputFields ? adaptateur.getInputFields() : [];
    champs.forEach((champ) => {
      if (!champsTraites.has(champ)) {
        champsTraites.add(champ);
        attacherChamp(champ);
      }
    });
  }

  // Approche hyper robuste (voir bugs.md — les adaptateurs dédiés par
  // sélecteur exact ou proximité du bouton d'envoi ne fonctionnaient
  // toujours pas sur les vrais Claude.ai/ChatGPT) : plutôt que deviner OÙ
  // se trouve un composer ou une zone de réponse, on attend que la page ait
  // cessé de bouger, puis on retraite TOUT — câblage des champs de saisie
  // détectables et marquage/substitution de tout tag [TYP:CODE] trouvé
  // n'importe où dans le texte rendu (reception.js exclut lui-même les
  // champs de saisie actifs, jamais touchés — R-31). Un seul
  // MutationObserver debouncé pour les deux, pas de contrat par site à
  // maintenir.
  const DELAI_STABILITE_MS = 500;
  let minuteurStabilite = null;

  function surPageStable() {
    traiterChamps();
    window.fogbankReception.traiterPage(document.body, resoudre);
  }

  function planifierStabilisation() {
    clearTimeout(minuteurStabilite);
    minuteurStabilite = setTimeout(surPageStable, DELAI_STABILITE_MS);
  }

  traiterChamps();
  // Passage de stabilisation même sans aucune mutation ultérieure : couvre
  // une page déjà entièrement rendue au chargement (conversation relue,
  // fixture statique) que le MutationObserver ci-dessous ne verrait jamais
  // bouger.
  planifierStabilisation();

  new MutationObserver(planifierStabilisation).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
