// Point d'entrée du content script (UC-001 : voir docs/SPECS.md).
// Orchestration : charge l'annuaire/config depuis chrome.storage.local,
// détermine le site courant, attache le menu de mention (M-03/M-04/M-05)
// et la substitution à l'envoi (M-06), avec rotation paresseuse (M-08).

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
  const champ = adaptateur.getInputField();
  if (!champ || champ.getAttribute('contenteditable') !== 'true') {
    // UC-001 est scopé au contenteditable (voir Contraintes de l'UC).
    return;
  }
  const boutonEnvoi = adaptateur.getSendTrigger();

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

  // M-10 (génération) + M-08 (rotation paresseuse) : synchrone sur le
  // cache en mémoire, persistance déclenchée en arrière-plan. Doit rester
  // synchrone pour pouvoir s'exécuter avant qu'un gestionnaire natif ne
  // lise le contenu du champ à l'envoi (voir substituerMentions).
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

  window.fogbankMentionMenu.attacher(champ, {
    caractereDeclencheur: config.caractereDeclencheur || '&',
    rechercherEntites,
    obtenirOuCreerAlias,
  });

  function substituerMentions() {
    const spans = Array.from(
      champ.querySelectorAll('span[data-fogbank-entity-id]')
    );
    spans.forEach((span) => {
      const entite = annuaire.find((e) => e.id === span.dataset.fogbankEntityId);
      if (!entite) {
        console.warn('[fogbank] entité introuvable pour la mention, non substituée :', span.dataset.fogbankEntityId);
        return;
      }
      const code = obtenirOuCreerAlias(entite);
      span.replaceWith(document.createTextNode(`[${entite.type}:${code}]`));
    });
  }

  if (boutonEnvoi) {
    // capture:true : s'exécute avant tout gestionnaire natif du site,
    // pour que le DOM soit déjà substitué quand celui-ci lit le champ.
    boutonEnvoi.addEventListener('click', substituerMentions, { capture: true });
  }
})();
