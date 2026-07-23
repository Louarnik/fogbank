// Side panel — surface principale (voir ADR-008, ADR-009, ARCHITECTURE.md).
// Composition (& + décoration), ciblage, réplication manuel/auto avec
// témoin de synchro, et affichage résolu de la réponse.
(async function () {
  const DUREE_EN_JOURS = { '1s': 7, '1t': 91, '1a': 365 };
  const DELAI_AUTO_MS = 350;
  const TEXTE_TEST_ECRITURE = 'Test fogbank — écriture';
  const PHRASE_TEST_ENVOI = 'test bien reçu';
  const TEXTE_TEST_ENVOI = `Ceci est un test, merci de répondre par « ${PHRASE_TEST_ENVOI} ».`;

  const etatCible = document.getElementById('etat-cible');
  const boutonRafraichirCible = document.getElementById('bouton-rafraichir-cible');
  const champCompose = document.getElementById('champ-compose');
  const selecteurMode = document.getElementById('select-mode');
  const temoinSynchro = document.getElementById('temoin-synchro');
  const messageSuspension = document.getElementById('message-suspension');
  const boutonReprendre = document.getElementById('bouton-reprendre');
  const boutonEnvoyer = document.getElementById('bouton-envoyer');
  const boutonCopier = document.getElementById('bouton-copier');
  const boutonLire = document.getElementById('bouton-lire');
  const texteClair = document.getElementById('texte-clair');
  const journal = document.getElementById('journal');

  const sectionOnboarding = document.getElementById('section-onboarding');
  const onboardingEtatCiblage = document.getElementById('onboarding-etat-ciblage');
  const boutonTestEcriture = document.getElementById('bouton-test-ecriture');
  const boutonTestEnvoi = document.getElementById('bouton-test-envoi');
  const boutonVerifierReponse = document.getElementById('bouton-verifier-reponse');
  const onboardingEtatVerification = document.getElementById('onboarding-etat-verification');
  const onboardingDuree = document.getElementById('onboarding-duree');
  const onboardingFormat = document.getElementById('onboarding-format');
  const boutonTerminerConfig = document.getElementById('bouton-terminer-config');
  const boutonPasserConfig = document.getElementById('bouton-passer-config');

  let config = {};
  let sites = [];
  let annuaire = [];
  let siteActif = null; // site fogbank.sites[] correspondant à l'onglet actif
  let ongletId = null;
  let compteurEchecs = 0;
  let syncSuspendue = false;
  let minuteurAuto = null;
  let onboardingIgnoree = false; // « Passer pour l'instant » — session uniquement, voir UC-005

  // --- Utilitaires ---------------------------------------------------

  function horodatage() {
    return new Date().toLocaleTimeString('fr-FR');
  }

  function logger(texte, niveau) {
    const ligne = document.createElement('div');
    ligne.className = `ligne-journal ${niveau || ''}`;
    ligne.textContent = `[${horodatage()}] ${texte}`;
    journal.prepend(ligne);
  }

  async function ongletActifCourant() {
    const [onglet] = await chrome.tabs.query({ active: true, currentWindow: true });
    return onglet;
  }

  async function envoyerAuContentScript(message) {
    if (!ongletId) return { ok: false, erreur: 'Aucun onglet actif détecté.' };
    try {
      return await chrome.tabs.sendMessage(ongletId, message);
    } catch (err) {
      const brut = (err && err.message) || String(err);
      const suffixe = /Receiving end does not exist/i.test(brut)
        ? ' — le content script fogbank n’est pas chargé sur cet onglet (page pas encore rechargée ?).'
        : '';
      return { ok: false, erreur: brut + suffixe };
    }
  }

  // --- Chargement des données -----------------------------------------

  async function chargerDonnees() {
    const donnees = await chrome.storage.local.get([
      'fogbank.config',
      'fogbank.sites',
      'fogbank.annuaire',
    ]);
    config = donnees['fogbank.config'] || { caractereDeclencheur: '&', formatParDefaut: 'court' };
    sites = donnees['fogbank.sites'] || [];
    annuaire = donnees['fogbank.annuaire'] || [];
  }

  async function determinerSite() {
    const onglet = await ongletActifCourant();
    ongletId = onglet && onglet.id ? onglet.id : null;
    siteActif =
      onglet && onglet.url ? window.fogbankSiteMatching.trouverSiteActifPour(sites, onglet.url) : null;
  }

  chrome.storage.onChanged.addListener((changements, zone) => {
    if (zone !== 'local') return;
    if (changements['fogbank.sites']) {
      sites = changements['fogbank.sites'].newValue || [];
      // Un site peut avoir été retrouvé par un id différent après rechargement des sites
      if (siteActif) siteActif = sites.find((s) => s.id === siteActif.id) || siteActif;
      majAffichageMode();
      afficherOnboarding();
    }
    if (changements['fogbank.annuaire']) {
      annuaire = changements['fogbank.annuaire'].newValue || [];
    }
    if (changements['fogbank.config']) {
      config = changements['fogbank.config'].newValue || config;
    }
  });

  // --- Rotation / résolution (M-08/M-10, voir pseudonyme.js) ------------

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

  // Sans site actif (onglet non reconnu), génère un code à la volée avec le
  // format par défaut plutôt que de bloquer la frappe (voir UC-001, Cas
  // d'erreur) — pas de siteId valide où persister une rotation.
  function obtenirOuCreerAlias(entite) {
    const aujourdHui = aujourdHuiISO();
    if (!siteActif) {
      return window.fogbankPseudonyme.genererCodeUnique(
        entite.nomReel,
        config.formatParDefaut || 'court',
        entite.type,
        annuaire
      );
    }
    let entree = entite.aliasParSite.find((a) => a.siteId === siteActif.id);
    if (entree && (entree.expireLe === null || entree.expireLe > aujourdHui)) {
      return entree.aliasActif;
    }
    const code = window.fogbankPseudonyme.genererCodeUnique(
      entite.nomReel,
      siteActif.formatPseudonyme,
      entite.type,
      annuaire
    );
    const expireLe = calculerExpiration(siteActif.dureeViePseudonyme, aujourdHui);
    if (!entree) {
      entree = { siteId: siteActif.id, aliasActif: code, expireLe, historique: [] };
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

  // --- Composition (M-03/M-04/M-05, voir UC-001) ------------------------

  const handle = window.fogbankTextareaHandle.creer(champCompose);

  window.fogbankMentionMenu.attacher(champCompose, handle, {
    caractereDeclencheur: config.caractereDeclencheur || '&',
    rechercherEntites,
    obtenirOuCreerAlias,
    creerRegexTag: window.fogbankPseudonyme.creerRegexTag,
  });

  window.fogbankDisplay.attacher(champCompose, handle, { resoudre });

  // --- Ciblage (M-15, voir UC-003) -------------------------------------

  function decrireCiblePourAffichage(cible) {
    if (!cible) return 'Aucune cible — clic droit sur un champ du site.';
    const morceaux = [cible.tag];
    if (cible.id) morceaux.push(`#${cible.id}`);
    if (cible.placeholder) morceaux.push(`« ${cible.placeholder} »`);
    morceaux.push(cible.contentEditable ? '(contenteditable)' : '(natif)');
    return morceaux.join(' ');
  }

  function afficherCible(cible) {
    const texte = decrireCiblePourAffichage(cible);
    etatCible.textContent = texte;
    onboardingEtatCiblage.textContent = cible
      ? `Ciblé : ${texte}`
      : 'Aucune cible — clic droit sur un champ du site → « fogbank : écrire ici ».';
  }

  async function rafraichirCible() {
    const reponse = await envoyerAuContentScript({ type: 'fogbank:etat-cible' });
    if (reponse && reponse.ok) {
      afficherCible(reponse.cible);
    } else {
      etatCible.textContent = (reponse && reponse.erreur) || 'Statut de ciblage indisponible.';
      onboardingEtatCiblage.textContent = etatCible.textContent;
    }
  }

  boutonRafraichirCible.addEventListener('click', rafraichirCible);

  // --- Configuration d'un site, onboarding (M-01/M-15, voir UC-005) -----

  function afficherOnboarding() {
    const doitAfficher = !!siteActif && !siteActif.configurationTerminee && !onboardingIgnoree;
    sectionOnboarding.hidden = !doitAfficher;
    if (doitAfficher) {
      onboardingDuree.value = siteActif.dureeViePseudonyme || '1a';
      onboardingFormat.value = siteActif.formatPseudonyme || 'court';
      onboardingEtatVerification.textContent = '';
      onboardingEtatVerification.className = '';
    }
  }

  async function mettreAJourSite(mutateur) {
    if (!siteActif) return;
    const donnees = await chrome.storage.local.get(['fogbank.sites']);
    const actuel = donnees['fogbank.sites'] || [];
    const site = actuel.find((s) => s.id === siteActif.id);
    if (site) {
      mutateur(site);
      await chrome.storage.local.set({ 'fogbank.sites': actuel });
    }
  }

  boutonTestEcriture.addEventListener('click', async () => {
    logger(`Test d'écriture : « ${TEXTE_TEST_ECRITURE} »`);
    const reponse = await envoyerAuContentScript({ type: 'fogbank:ecrire', texte: TEXTE_TEST_ECRITURE });
    if (reponse && reponse.ok && reponse.resultat.contenuCorrespond) {
      logger('Texte de test écrit — vérifiez qu’il apparaît sur la page du site.', 'succes');
    } else {
      logger(`Échec du test d'écriture : ${(reponse && reponse.erreur) || 'contenu différent après écriture'}`, 'erreur');
    }
  });

  boutonTestEnvoi.addEventListener('click', async () => {
    logger(`Test d'envoi : « ${TEXTE_TEST_ENVOI} »`);
    const reponse = await envoyerAuContentScript({ type: 'fogbank:ecrire', texte: TEXTE_TEST_ENVOI });
    if (reponse && reponse.ok && reponse.resultat.contenuCorrespond) {
      logger('Message de test écrit — envoyez-le depuis le site, puis cliquez sur « Vérifier la réponse ».', 'succes');
    } else {
      logger(`Échec de l'écriture du message de test : ${(reponse && reponse.erreur) || 'contenu différent après écriture'}`, 'erreur');
    }
  });

  boutonVerifierReponse.addEventListener('click', async () => {
    const reponse = await envoyerAuContentScript({ type: 'fogbank:lire-clair' });
    if (!reponse || !reponse.ok) {
      onboardingEtatVerification.textContent = `Échec de lecture : ${(reponse && reponse.erreur) || 'réponse vide'}`;
      onboardingEtatVerification.className = 'erreur';
      return;
    }
    const trouve = reponse.texte.toLowerCase().includes(PHRASE_TEST_ENVOI.toLowerCase());
    if (trouve) {
      onboardingEtatVerification.textContent = '« test bien reçu » trouvé sur la page — écriture et lecture fonctionnent sur ce site.';
      onboardingEtatVerification.className = 'succes';
    } else {
      onboardingEtatVerification.textContent =
        '« test bien reçu » non trouvé — la réponse est peut-être encore en cours, ou l’IA a reformulé. Réessayez, ou passez à l’étape suivante si vous l’avez constaté de visu.';
      onboardingEtatVerification.className = 'erreur';
    }
  });

  boutonTerminerConfig.addEventListener('click', async () => {
    await mettreAJourSite((site) => {
      site.dureeViePseudonyme = onboardingDuree.value;
      site.formatPseudonyme = onboardingFormat.value;
      site.configurationTerminee = true;
    });
    logger(`Configuration de ${siteActif.domaine} terminée.`, 'succes');
  });

  boutonPasserConfig.addEventListener('click', () => {
    onboardingIgnoree = true;
    afficherOnboarding();
  });

  // --- Réplication (M-16, voir UC-004) ----------------------------------

  function majTemoin(etat) {
    temoinSynchro.dataset.etat = etat;
    temoinSynchro.textContent =
      { synchronise: 'Synchronisé', attente: 'En attente', echec: 'Échec', suspendu: 'Suspendu', inactif: '—' }[
        etat
      ] || etat;
  }

  function majAffichageMode() {
    selecteurMode.value = (siteActif && siteActif.modeReplication) || 'manuel';
  }

  async function definirModeReplication(mode) {
    if (!siteActif) return;
    const donnees = await chrome.storage.local.get(['fogbank.sites']);
    const actuel = donnees['fogbank.sites'] || [];
    const site = actuel.find((s) => s.id === siteActif.id);
    if (site) {
      site.modeReplication = mode;
      await chrome.storage.local.set({ 'fogbank.sites': actuel });
    }
  }

  selecteurMode.addEventListener('change', () => {
    definirModeReplication(selecteurMode.value);
  });

  function modeActuel() {
    return (siteActif && siteActif.modeReplication) || 'manuel';
  }

  async function envoyer(estAuto) {
    if (estAuto && syncSuspendue) return; // panneau maître : pas de reprise silencieuse
    const texte = champCompose.value;
    majTemoin('attente');
    const reponse = await envoyerAuContentScript({ type: 'fogbank:ecrire', texte });

    if (!reponse || !reponse.ok) {
      majTemoin('echec');
      logger(`Échec de réplication : ${(reponse && reponse.erreur) || 'réponse vide'}`, 'erreur');
      gererEchec(estAuto);
      return;
    }

    const { contenuCorrespond, contenuFinal } = reponse.resultat;
    if (contenuCorrespond) {
      majTemoin('synchronise');
      compteurEchecs = 0;
      logger('Réplication OK.', 'succes');
    } else {
      majTemoin('echec');
      logger(`Écart après écriture — contenu final : « ${contenuFinal} ».`, 'erreur');
      gererEchec(estAuto);
    }
  }

  async function gererEchec(estAuto) {
    compteurEchecs += 1;
    if (estAuto && compteurEchecs >= 2) {
      await definirModeReplication('manuel');
      majAffichageMode();
      logger('Mode automatique désactivé après échecs répétés — repassé en manuel pour cette session.', 'erreur');
    }
  }

  function planifierEnvoiAuto() {
    clearTimeout(minuteurAuto);
    minuteurAuto = setTimeout(() => envoyer(true), DELAI_AUTO_MS);
  }

  handle.onInput(() => {
    if (modeActuel() === 'auto') planifierEnvoiAuto();
  });

  boutonEnvoyer.addEventListener('click', () => envoyer(false));

  boutonCopier.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(champCompose.value);
      logger('Copié dans le presse-papier.', 'succes');
    } catch (err) {
      logger(`Échec de copie : ${err.message || err}`, 'erreur');
    }
  });

  boutonReprendre.addEventListener('click', () => {
    syncSuspendue = false;
    messageSuspension.hidden = true;
    majTemoin('inactif');
    logger('Synchronisation reprise.');
  });

  // --- Réception (M-07, voir UC-002) ------------------------------------

  function substituerTags(texteBrut) {
    const regex = window.fogbankPseudonyme.creerRegexTag();
    return texteBrut.replace(regex, (tagComplet, type, code) => {
      const entite = window.fogbankPseudonyme.resoudreEntite(annuaire, type, code);
      return entite ? entite.nomReel : tagComplet;
    });
  }

  function afficherTexteClair(texteBrut) {
    texteClair.textContent = substituerTags(texteBrut);
  }

  boutonLire.addEventListener('click', async () => {
    const reponse = await envoyerAuContentScript({ type: 'fogbank:lire-clair' });
    if (reponse && reponse.ok) {
      afficherTexteClair(reponse.texte);
    } else {
      logger(`Échec de lecture : ${(reponse && reponse.erreur) || 'réponse vide'}`, 'erreur');
    }
  });

  // --- Messages diffusés par le content script --------------------------

  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return;
    if (message.type === 'fogbank:cible-mise-a-jour') {
      afficherCible(message.cible);
    } else if (message.type === 'fogbank:page-stable') {
      afficherTexteClair(message.texte);
    } else if (message.type === 'fogbank:modification-externe') {
      syncSuspendue = true;
      majTemoin('suspendu');
      messageSuspension.hidden = false;
      logger('Modification externe détectée sur le champ du site — synchro suspendue.', 'erreur');
    }
  });

  // --- Changement d'onglet ----------------------------------------------

  async function reinitialiserPourOngletActif() {
    await determinerSite();
    majAffichageMode();
    syncSuspendue = false;
    compteurEchecs = 0;
    onboardingIgnoree = false;
    messageSuspension.hidden = true;
    majTemoin('inactif');
    afficherOnboarding();
    await rafraichirCible();
  }

  chrome.tabs.onActivated.addListener(() => {
    reinitialiserPourOngletActif();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' && tabId === ongletId) {
      reinitialiserPourOngletActif();
    }
  });

  // --- Démarrage ----------------------------------------------------------

  await chargerDonnees();
  await reinitialiserPourOngletActif();
})();
