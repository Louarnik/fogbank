// Side panel — surface principale (voir ADR-008, ADR-009, ARCHITECTURE.md).
// Composition (& + décoration), ciblage, réplication manuel/auto avec
// témoin de synchro, et affichage résolu de la réponse.
(async function () {
  const DUREE_EN_JOURS = { '1s': 7, '1t': 91, '1a': 365 };
  const DELAI_AUTO_MS = 350;
  const TEXTE_TEST_ECRITURE = 'Test fogbank — écriture';
  // [LOC:PA0001] résout vers l'entité par défaut « Paris, France » (voir
  // UC-005, Données) : un tag réel et résolvable plutôt qu'arbitraire, pour
  // que la vérification teste aussi la résolution (M-10), pas seulement la
  // présence d'une sous-chaîne.
  const PHRASE_TEST_ENVOI = 'test bien reçu [LOC:PA0001]';
  const TEXTE_TEST_ENVOI = `Ceci est un test, merci de répondre par « ${PHRASE_TEST_ENVOI} ».`;
  const MARGE_CONTEXTE = 150;

  const banniereLigne1 = document.getElementById('banniere-ligne1');
  const banniereModeResume = document.getElementById('banniere-mode-resume');
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
  const boutonCopierLecture = document.getElementById('bouton-copier-lecture');
  const boutonLocaliser = document.getElementById('bouton-localiser');
  const texteClair = document.getElementById('texte-clair');
  const journal = document.getElementById('journal');

  const sectionOnboarding = document.getElementById('section-onboarding');
  const onboardingEtatCiblage = document.getElementById('onboarding-etat-ciblage');
  const boutonTestEcriture = document.getElementById('bouton-test-ecriture');
  const boutonTestEnvoi = document.getElementById('bouton-test-envoi');
  const boutonVerifierReponse = document.getElementById('bouton-verifier-reponse');
  const onboardingEtatVerification = document.getElementById('onboarding-etat-verification');
  const onboardingDialogue = document.getElementById('onboarding-dialogue');
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

  // Ligne 1 de la bannière (voir docs/SPECS.md, § Ergonomie) : distincte de
  // `siteActif` (qui ne matche qu'un site actif, pour la logique
  // fonctionnelle) — une correspondance même sur un site désactivé doit
  // pouvoir s'afficher ici, avec son statut.
  function afficherBanniereSite(onglet) {
    const site =
      onglet && onglet.url ? window.fogbankSiteMatching.trouverSiteConfigurePour(sites, onglet.url) : null;
    banniereLigne1.textContent = site
      ? `${site.domaine} — ${site.actif ? 'actif' : 'inactif'}`
      : 'Site non reconnu par fogbank.';
  }

  async function determinerSite() {
    const onglet = await ongletActifCourant();
    ongletId = onglet && onglet.id ? onglet.id : null;
    siteActif =
      onglet && onglet.url ? window.fogbankSiteMatching.trouverSiteActifPour(sites, onglet.url) : null;
    afficherBanniereSite(onglet);
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

  // Sans site actif (onglet non reconnu), génère un alias à la volée avec le
  // format par défaut plutôt que de bloquer la frappe (voir UC-001, Cas
  // d'erreur) — pas de siteId valide où persister une rotation.
  function obtenirOuCreerAlias(entite) {
    const aujourdHui = aujourdHuiISO();
    if (!siteActif) {
      return window.fogbankPseudonyme.genererAliasUnique(
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
    const alias = window.fogbankPseudonyme.genererAliasUnique(
      entite.nomReel,
      siteActif.formatPseudonyme,
      entite.type,
      annuaire
    );
    const expireLe = calculerExpiration(siteActif.dureeViePseudonyme, aujourdHui);
    if (!entree) {
      entree = { siteId: siteActif.id, aliasActif: alias, expireLe, historique: [] };
      entite.aliasParSite.push(entree);
    } else {
      entree.aliasActif = alias;
      entree.expireLe = expireLe;
    }
    entree.historique.push({ alias, attribueLe: aujourdHui, expireLe });
    persisterAnnuaire();
    return alias;
  }

  function rechercherEntites(filtre) {
    const f = filtre.toLowerCase();
    return annuaire.filter((e) => e.nomReel.toLowerCase().includes(f));
  }

  function resoudre(type, alias) {
    return window.fogbankPseudonyme.resoudreEntite(annuaire, type, alias);
  }

  // --- Composition (M-03/M-04/M-05, voir UC-001) ------------------------

  const handle = window.fogbankTextareaHandle.creer(champCompose);

  // mentionMenuHandle.obtenirMentions() est la source de vérité des
  // mentions actuellement suivies (voir mention-menu.js) — display.js
  // décore d'après cette même liste, et la réplication (plus bas) s'en
  // sert pour reconstruire la version taguée envoyée au site.
  const mentionMenuHandle = window.fogbankMentionMenu.attacher(champCompose, handle, {
    caractereDeclencheur: config.caractereDeclencheur || '&',
    rechercherEntites,
    obtenirOuCreerAlias,
  });

  window.fogbankDisplay.attacher(champCompose, handle, {
    obtenirMentions: mentionMenuHandle.obtenirMentions,
  });

  // Reconstruit, à partir du texte en clair du panneau, la version que le
  // site doit recevoir : chaque mention suivie est remplacée par son tag
  // [TYP:ALIAS] — traité du plus loin au plus proche pour ne jamais
  // invalider les décalages des remplacements suivants. C'est la seule
  // fonction qui fait exister un tag : nulle part ailleurs dans le
  // panneau (voir docs/SPECS.md, Vue d'ensemble — le panneau est en
  // clair, le site reçoit le pseudonymisé).
  function construireTexteTague(texte) {
    const mentions = [...mentionMenuHandle.obtenirMentions()].sort((a, b) => b.debut - a.debut);
    let resultat = texte;
    mentions.forEach((m) => {
      const tag = `[${m.entite.type}:${m.alias}]`;
      resultat = resultat.slice(0, m.debut) + tag + resultat.slice(m.fin);
    });
    return resultat;
  }

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
      onboardingDialogue.hidden = true;
      onboardingDialogue.textContent = '';
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

  // Toutes les positions (insensible à la casse) où `sousChaine` apparaît
  // dans `texte` — voir UC-005, Test d'envoi : la première correspond au
  // message de l'utilisateur (qui contient la phrase complète), la
  // dernière à la réponse de l'IA la plus récente (pas la seconde, en cas
  // de régénération : voir Cas d'erreur de l'UC).
  function trouverOccurrences(texte, sousChaine) {
    const positions = [];
    const texteMin = texte.toLowerCase();
    const cibleMin = sousChaine.toLowerCase();
    let depart = 0;
    let index = texteMin.indexOf(cibleMin, depart);
    while (index !== -1) {
      positions.push(index);
      depart = index + cibleMin.length;
      index = texteMin.indexOf(cibleMin, depart);
    }
    return positions;
  }

  function extraireContexte(texte, index, longueurCible) {
    const debut = Math.max(0, index - MARGE_CONTEXTE);
    const fin = Math.min(texte.length, index + longueurCible + MARGE_CONTEXTE);
    return texte.slice(debut, fin).trim();
  }

  boutonVerifierReponse.addEventListener('click', async () => {
    onboardingDialogue.hidden = true;
    onboardingDialogue.textContent = '';

    const reponse = await envoyerAuContentScript({ type: 'fogbank:lire-clair' });
    if (!reponse || !reponse.ok) {
      onboardingEtatVerification.textContent = `Échec de lecture : ${(reponse && reponse.erreur) || 'réponse vide'}`;
      onboardingEtatVerification.className = 'erreur';
      return;
    }

    const occurrences = trouverOccurrences(reponse.texte, PHRASE_TEST_ENVOI);

    if (occurrences.length === 0) {
      onboardingEtatVerification.textContent =
        '« test bien reçu » introuvable — la réponse est peut-être encore en cours. Réessayez, ou passez à l’étape suivante si vous l’avez constaté de visu.';
      onboardingEtatVerification.className = 'erreur';
      return;
    }

    if (occurrences.length === 1) {
      onboardingEtatVerification.textContent =
        'Une seule occurrence trouvée — non concluant (la réponse n’est peut-être pas encore visible, ou le site ne restitue pas le message utilisateur dans le texte lu). Réessayez.';
      onboardingEtatVerification.className = 'erreur';
      return;
    }

    // Régénération possible : la dernière occurrence est la réponse la
    // plus récente, pas nécessairement la deuxième trouvée.
    const indexUtilisateur = occurrences[0];
    const indexAssistant = occurrences[occurrences.length - 1];
    const messageUtilisateur = resoudreTags(
      extraireContexte(reponse.texte, indexUtilisateur, PHRASE_TEST_ENVOI.length)
    );
    const messageAssistant = resoudreTags(
      extraireContexte(reponse.texte, indexAssistant, PHRASE_TEST_ENVOI.length)
    );

    onboardingEtatVerification.textContent = `« test bien reçu » trouvé (${occurrences.length} occurrence${occurrences.length > 1 ? 's' : ''}) — écriture et lecture fonctionnent sur ce site.`;
    onboardingEtatVerification.className = 'succes';
    onboardingDialogue.hidden = false;
    onboardingDialogue.textContent = `Vous : ${messageUtilisateur}\n\nIA : ${messageAssistant}`;
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
    const mode = (siteActif && siteActif.modeReplication) || 'manuel';
    selecteurMode.value = mode;
    banniereModeResume.textContent = `Réplication : ${mode === 'auto' ? 'auto' : 'manuel'}`;
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
    const texte = construireTexteTague(champCompose.value);
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

  // Repli presse-papier (voir UC-004) : copie la version taguée, pas le
  // texte en clair du panneau — sans quoi ce repli enverrait un nom réel
  // dès qu'il est collé sur le site, contournant la pseudonymisation.
  boutonCopier.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(construireTexteTague(champCompose.value));
      logger('Copié dans le presse-papier (version pseudonymisée).', 'succes');
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

  function resoudreTags(texteBrut) {
    const regex = window.fogbankPseudonyme.creerRegexTag();
    return texteBrut.replace(regex, (tagComplet, type, alias) => {
      const entite = window.fogbankPseudonyme.resoudreEntite(annuaire, type, alias);
      return entite ? entite.nomReel : tagComplet;
    });
  }

  function afficherTexteClair(texteBrut) {
    texteClair.textContent = resoudreTags(texteBrut);
  }

  boutonLire.addEventListener('click', async () => {
    const reponse = await envoyerAuContentScript({ type: 'fogbank:lire-clair' });
    if (reponse && reponse.ok) {
      afficherTexteClair(reponse.texte);
    } else {
      logger(`Échec de lecture : ${(reponse && reponse.erreur) || 'réponse vide'}`, 'erreur');
    }
  });

  boutonCopierLecture.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texteClair.textContent);
      logger('Historique copié dans le presse-papier.', 'succes');
    } catch (err) {
      logger(`Échec de copie : ${err.message || err}`, 'erreur');
    }
  });

  // Localiser (voir docs/SPECS.md, § Ergonomie) : un aller simple vers la
  // position correspondante sur la page du site, pas une navigation
  // synchronisée. V1 best-effort : cherche le texte tel quel — s'il
  // provient d'une portion résolue de l'historique (nom réel affiché à la
  // place d'un tag), la recherche échoue sur le site, qui ne connaît que
  // le tag brut. Cas non résolu pour l'instant, voir SPECS.md.
  boutonLocaliser.addEventListener('click', async () => {
    const selection = window.getSelection().toString().trim();
    const texte = selection || texteClair.textContent.slice(0, 200).trim();
    if (!texte) {
      logger('Rien à localiser — sélectionnez du texte dans l’historique, ou lisez la page d’abord.', 'erreur');
      return;
    }
    const reponse = await envoyerAuContentScript({ type: 'fogbank:localiser', texte });
    if (reponse && reponse.ok) {
      logger('Texte localisé sur la page.', 'succes');
    } else {
      logger(
        'Texte introuvable tel quel sur la page — peut-être affiché sous sa forme résolue (nom réel) plutôt que le tag brut.',
        'erreur'
      );
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
