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
  const PLACEHOLDER_DEFAUT = 'Tapez & pour mentionner une entité…';
  const PLACEHOLDER_CLIC_DROIT =
    'Faites un clic droit dans la zone de saisie du site pour commencer la configuration.';

  const banniereDomaine = document.getElementById('banniere-domaine');
  const banniereStatut = document.getElementById('banniere-statut');
  const champCompose = document.getElementById('champ-compose');
  const toggleEnvoiAuto = document.getElementById('toggle-envoi-auto');
  const temoinCible = document.getElementById('temoin-cible');
  const messageSuspension = document.getElementById('message-suspension');
  const boutonReprendre = document.getElementById('bouton-reprendre');
  const boutonEnvoyer = document.getElementById('bouton-envoyer');
  const boutonLire = document.getElementById('bouton-lire');
  const boutonCopierLecture = document.getElementById('bouton-copier-lecture');
  const boutonLocaliser = document.getElementById('bouton-localiser');
  const texteClair = document.getElementById('texte-clair');
  const cadreHistorique = document.getElementById('cadre-historique');
  const bullesHistorique = document.getElementById('bulles-historique');
  const actionsRepliHistorique = document.getElementById('actions-repli-historique');
  const sousTitreRepliHistorique = document.getElementById('sous-titre-repli-historique');

  const boutonCompteur = document.getElementById('bouton-compteur');
  const compteurLibelle = document.getElementById('compteur-libelle');
  const compteurMenu = document.getElementById('compteur-menu');
  const compteurListe = document.getElementById('compteur-liste');

  const boutonConvertirFichier = document.getElementById('bouton-convertir-fichier');
  const entreeFichierConversion = document.getElementById('entree-fichier-conversion');
  const choixSensConversion = document.getElementById('choix-sens-conversion');
  const nomFichierConversion = document.getElementById('nom-fichier-conversion');
  const boutonPseudonymiserFichier = document.getElementById('bouton-pseudonymiser-fichier');
  const boutonRestaurerFichier = document.getElementById('bouton-restaurer-fichier');
  const toggleConversionAuto = document.getElementById('toggle-conversion-auto');
  const noteConversionAuto = document.getElementById('note-conversion-auto');

  const sectionLecture = document.getElementById('section-lecture');
  const sectionComposition = document.getElementById('section-composition');
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

  const TAILLE_MAX_JOURNAL = 200;

  let config = {};
  let sites = [];
  let annuaire = [];
  let journal = []; // fogbank.journal — voir la page Journal des options
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

  // Journal (debug) — n'est plus affiché dans le panneau (voir ADR /
  // handoff side panel ergonomie) : persisté dans fogbank.journal et
  // consultable depuis une page dédiée des options.
  function logger(texte, niveau) {
    journal.unshift({ horodatage: horodatage(), texte, niveau: niveau || '' });
    if (journal.length > TAILLE_MAX_JOURNAL) journal.length = TAILLE_MAX_JOURNAL;
    chrome.storage.local.set({ 'fogbank.journal': journal }).catch((err) => {
      console.error('[fogbank] échec de sauvegarde du journal :', err);
    });
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
      'fogbank.journal',
    ]);
    config = donnees['fogbank.config'] || { caractereDeclencheur: '&', formatParDefaut: 'court' };
    sites = donnees['fogbank.sites'] || [];
    annuaire = donnees['fogbank.annuaire'] || [];
    journal = donnees['fogbank.journal'] || [];
  }

  // Ligne 1 de la bannière (voir docs/SPECS.md, § Ergonomie) : distincte de
  // `siteActif` (qui ne matche qu'un site actif, pour la logique
  // fonctionnelle) — une correspondance même sur un site désactivé doit
  // pouvoir s'afficher ici, avec son statut.
  function afficherBanniereSite(onglet) {
    const site =
      onglet && onglet.url ? window.fogbankSiteMatching.trouverSiteConfigurePour(sites, onglet.url) : null;
    banniereDomaine.textContent = site ? site.domaine : 'Site non reconnu par fogbank.';
    banniereStatut.textContent = site ? (site.actif ? 'Actif' : 'Inactif') : '—';
    banniereStatut.classList.toggle('tag-accent', !!site && site.actif);
    banniereStatut.classList.toggle('tag-neutre', !site || !site.actif);
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
      majAffichageConversion();
      afficherOnboarding();
      majAccessibiliteSections();
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

  const handle = window.fogbankContentEditableHandle.creer(champCompose);

  // mentionMenuHandle.obtenirMentions() est la source de vérité des
  // mentions actuellement suivies (voir mention-menu.js) — display.js
  // décore d'après cette même liste, et la réplication (plus bas) s'en
  // sert pour reconstruire la version taguée envoyée au site.
  // `onMentionsChanged` compense la réentrance décrite dans
  // mention-menu.js (`inserer`) : sans cet appel explicite, le trait de la
  // mention qu'on vient d'insérer n'est dessiné qu'au prochain événement
  // fortuit (resize/scroll/frappe suivante) — visible comme un
  // soulignement manquant, ou plusieurs qui apparaissent d'un coup plus
  // tard une fois plusieurs mentions accumulées.
  const mentionMenuHandle = window.fogbankMentionMenu.attacher(champCompose, handle, {
    caractereDeclencheur: config.caractereDeclencheur || '&',
    rechercherEntites,
    obtenirOuCreerAlias,
    onMentionsChanged: () => displayHandle.rafraichir(),
  });

  const displayHandle = window.fogbankDisplay.attacher(champCompose, handle, {
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

  // --- Pastille compteur (voir UC-001, point 6) -------------------------

  // Entités distinctes actuellement mentionnées dans le composer, dans
  // l'ordre de leur première mention — une même entité mentionnée
  // plusieurs fois ne compte que pour une.
  function entitesMentionneesDistinctes() {
    const vues = new Set();
    const resultat = [];
    mentionMenuHandle.obtenirMentions().forEach((m) => {
      if (vues.has(m.entite)) return;
      vues.add(m.entite);
      resultat.push(m);
    });
    return resultat;
  }

  function fermerMenuCompteur() {
    compteurMenu.hidden = true;
  }

  function majCompteur() {
    const entites = entitesMentionneesDistinctes();
    const n = entites.length;
    boutonCompteur.dataset.etat = n > 0 ? 'actif' : 'zero';
    compteurLibelle.textContent = n > 0 ? `${n} masqué${n > 1 ? 's' : ''}` : '0 masqué';

    compteurListe.innerHTML = '';
    entites.forEach((m) => {
      const ligne = document.createElement('div');
      ligne.className = 'compteur-ligne';
      const nom = document.createElement('span');
      nom.textContent = m.entite.nomReel;
      const tag = document.createElement('span');
      tag.className = 'compteur-tag';
      tag.textContent = `[${m.entite.type}:${m.alias}]`;
      ligne.append(nom, tag);
      compteurListe.appendChild(ligne);
    });
    if (n === 0) fermerMenuCompteur();
  }

  boutonCompteur.addEventListener('click', () => {
    compteurMenu.hidden = !compteurMenu.hidden;
  });

  document.addEventListener('click', (e) => {
    if (!compteurMenu.hidden && !e.target.closest('.compteur-conteneur')) fermerMenuCompteur();
  });

  // --- Ciblage (M-15, voir UC-003) -------------------------------------

  function decrireCiblePourAffichage(cible) {
    return cible
      ? 'Cible écriture OK'
      : 'Cible écriture NOK — faites un clic droit dans la zone de saisie du site pour commencer la configuration.';
  }

  // L'encart à droite de « Composer » (`temoinCible`) reflète uniquement la
  // cible d'écriture — vert « Cible OK » si un champ du site est ciblé,
  // rouge « Cible NOK » sinon. Pas de notion de synchronisation ici : le
  // succès/échec d'un envoi est uniquement journalisé (voir logger() dans
  // envoyer()), il ne change plus la couleur de ce badge.
  // L'instruction elle-même (« faites un clic droit… ») s'affiche dans le
  // champ de composition (son placeholder) plutôt que dans une bulle
  // d'aide : c'est là que le regard est déjà posé pour écrire.
  function afficherCible(cible) {
    onboardingEtatCiblage.textContent = decrireCiblePourAffichage(cible);
    temoinCible.dataset.etat = cible ? 'ok' : 'nok';
    temoinCible.textContent = cible ? 'Cible OK' : 'Cible NOK';
    champCompose.dataset.placeholder = cible ? PLACEHOLDER_DEFAUT : PLACEHOLDER_CLIC_DROIT;
  }

  // Site actif (voir site-matching.js, trouverSiteActifPour) déjà filtré sur
  // `actif`, ne reste qu'à vérifier la configuration : hors scope (aucun
  // site ne correspond, ou site désactivé) ou configuration inachevée, les
  // sections lecture/composition n'ont rien de valide à faire — les griser
  // et les rendre inertes évite d'y déclencher des actions qui
  // échoueraient (ou pire, réussiraient sur le mauvais onglet) et
  // d'afficher des erreurs de ciblage/synchro sans objet sur ces pages.
  function siteUtilisable() {
    return !!siteActif && !!siteActif.configurationTerminee;
  }

  function majAccessibiliteSections() {
    const utilisable = siteUtilisable();
    [sectionLecture, sectionComposition].forEach((section) => {
      section.classList.toggle('section-desactivee', !utilisable);
      section.querySelectorAll('button, input, select, textarea').forEach((el) => {
        el.disabled = !utilisable;
      });
    });
    // #champ-compose est un <div contenteditable>, pas un <textarea> :
    // `.disabled` n'existe pas dessus, il faut couper l'édition elle-même
    // (sans quoi le clavier resterait actif malgré section-desactivee).
    champCompose.contentEditable = utilisable ? 'true' : 'false';
    if (!utilisable) {
      onboardingEtatCiblage.textContent = '—';
      temoinCible.dataset.etat = 'inconnu';
      temoinCible.textContent = '—';
      champCompose.dataset.placeholder = PLACEHOLDER_CLIC_DROIT;
    }
  }

  async function rafraichirCible() {
    if (!siteUtilisable()) return;
    const reponse = await envoyerAuContentScript({ type: 'fogbank:etat-cible' });
    if (reponse && reponse.ok) {
      afficherCible(reponse.cible);
    } else {
      onboardingEtatCiblage.textContent = (reponse && reponse.erreur) || 'Statut de ciblage indisponible.';
    }
  }

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

  function majAffichageMode() {
    const mode = (siteActif && siteActif.modeReplication) || 'manuel';
    toggleEnvoiAuto.checked = mode === 'auto';
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

  toggleEnvoiAuto.addEventListener('change', () => {
    definirModeReplication(toggleEnvoiAuto.checked ? 'auto' : 'manuel');
  });

  function modeActuel() {
    return (siteActif && siteActif.modeReplication) || 'manuel';
  }

  async function envoyer(estAuto) {
    if (estAuto && syncSuspendue) return; // panneau maître : pas de reprise silencieuse
    const texte = construireTexteTague(champCompose.textContent);
    const reponse = await envoyerAuContentScript({ type: 'fogbank:ecrire', texte });

    if (!reponse || !reponse.ok) {
      logger(`Échec de réplication : ${(reponse && reponse.erreur) || 'réponse vide'}`, 'erreur');
      gererEchec(estAuto);
      return;
    }

    const { contenuCorrespond, contenuFinal } = reponse.resultat;
    if (contenuCorrespond) {
      compteurEchecs = 0;
      logger('Réplication OK.', 'succes');
    } else {
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
    majCompteur();
    if (modeActuel() === 'auto') planifierEnvoiAuto();
  });

  boutonEnvoyer.addEventListener('click', () => envoyer(false));

  boutonReprendre.addEventListener('click', () => {
    syncSuspendue = false;
    messageSuspension.hidden = true;
    logger('Synchronisation reprise.');
  });

  // --- Conversion de fichiers (M-12, voir UC-006) -----------------------
  //
  // Mode manuel implémenté : lecture locale (FileReader), conversion en
  // mémoire (logique partagée avec les tests, voir
  // content/conversion-fichier.js), téléchargement du résultat avec infixe
  // .mask/.unmask — jamais d'écrasement du fichier d'origine, jamais
  // d'appel réseau. Le mode automatique (toggle) n'est que persisté pour
  // l'instant, voir docs/SPECS.md UC-006, Points ouverts.

  function pseudonymiserTexte(texte) {
    return window.fogbankConversionFichier.pseudonymiser(texte, annuaire, obtenirOuCreerAlias);
  }

  function telechargerTexte(texte, nomFichierOriginal, infixe) {
    const pointIndex = nomFichierOriginal.lastIndexOf('.');
    const nomFichier =
      pointIndex === -1
        ? `${nomFichierOriginal}.${infixe}`
        : `${nomFichierOriginal.slice(0, pointIndex)}.${infixe}${nomFichierOriginal.slice(pointIndex)}`;
    const blob = new Blob([texte], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nomFichier;
    lien.click();
    URL.revokeObjectURL(url);
  }

  let fichierEnAttente = null; // fichier choisi, en attente du choix de sens (voir choix-sens-conversion)

  function fermerChoixSensConversion() {
    fichierEnAttente = null;
    choixSensConversion.hidden = true;
    nomFichierConversion.textContent = '';
  }

  boutonConvertirFichier.addEventListener('click', () => {
    entreeFichierConversion.value = '';
    entreeFichierConversion.click();
  });

  entreeFichierConversion.addEventListener('change', () => {
    const fichier = entreeFichierConversion.files[0];
    if (!fichier) return;
    fichierEnAttente = fichier;
    nomFichierConversion.textContent = `« ${fichier.name} » — dans quel sens ?`;
    choixSensConversion.hidden = false;
  });

  async function convertirFichierEnAttente(versTag) {
    const fichier = fichierEnAttente;
    if (!fichier) return;
    fermerChoixSensConversion();
    try {
      const texte = await fichier.text();
      const resultat = versTag ? pseudonymiserTexte(texte) : resoudreTags(texte);
      telechargerTexte(resultat, fichier.name, versTag ? 'mask' : 'unmask');
      logger(`Fichier « ${fichier.name} » converti (${versTag ? 'pseudonymisé' : 'restauré'}).`, 'succes');
    } catch (err) {
      logger(`Échec de conversion du fichier : ${err.message || err}`, 'erreur');
    }
  }

  boutonPseudonymiserFichier.addEventListener('click', () => convertirFichierEnAttente(true));
  boutonRestaurerFichier.addEventListener('click', () => convertirFichierEnAttente(false));

  function majAffichageConversion() {
    const mode = (siteActif && siteActif.conversionFichierMode) || 'manuel';
    toggleConversionAuto.checked = mode === 'auto';
    boutonConvertirFichier.hidden = mode === 'auto';
    noteConversionAuto.hidden = mode !== 'auto';
    if (mode === 'auto') fermerChoixSensConversion();
  }

  async function definirModeConversion(mode) {
    if (!siteActif) return;
    await mettreAJourSite((site) => {
      site.conversionFichierMode = mode;
    });
  }

  toggleConversionAuto.addEventListener('change', async () => {
    await definirModeConversion(toggleConversionAuto.checked ? 'auto' : 'manuel');
    majAffichageConversion();
  });

  // --- Réception (M-07, voir UC-002) ------------------------------------

  function resoudreTags(texteBrut) {
    return window.fogbankConversionFichier.restaurer(texteBrut, annuaire);
  }

  // Bulles par tour (voir ADR-011, UC-002 révisé) si le content script a pu
  // les identifier (profil de site, voir profils-lecture.js) ; sinon repli
  // sur le bloc de texte unique (comportement historique) — jamais
  // d'échec, seulement une dégradation.
  let texteResoluCourant = ''; // pour Copier/Localiser globaux (mode repli)

  const ICONE_COPIER =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
  const ICONE_LOCALISER =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" x2="18" y1="12" y2="12"></line><line x1="6" x2="2" y1="12" y2="12"></line><line x1="12" x2="12" y1="6" y2="2"></line><line x1="12" x2="12" y1="22" y2="18"></line></svg>';

  // Les actions (copier/localiser) sortent de la bulle plutôt que d'y
  // prendre une ligne d'entête : elles se placent à côté, du côté opposé à
  // l'alignement (à gauche de « Vous », à droite de l'assistant) pour ne
  // pas mordre sur la largeur de texte disponible. `title` sert d'info-
  // bulle d'aide au survol, seule indication puisque les boutons n'ont pas
  // de libellé visible.
  function construireBulle(tour, texteResolu) {
    const ligne = document.createElement('div');
    ligne.className = `ligne-bulle ligne-bulle-${tour.role}`;

    const bulle = document.createElement('div');
    bulle.className = `bulle bulle-${tour.role}`;
    const corps = document.createElement('p');
    corps.className = 'bulle-texte';
    corps.textContent = texteResolu;
    bulle.append(corps);

    const actions = document.createElement('div');
    actions.className = 'bulle-actions';
    const boutonCopierBulle = document.createElement('button');
    boutonCopierBulle.type = 'button';
    boutonCopierBulle.className = 'btn-icone';
    boutonCopierBulle.title = 'Copier ce message';
    boutonCopierBulle.setAttribute('aria-label', 'Copier ce message');
    boutonCopierBulle.innerHTML = ICONE_COPIER;
    boutonCopierBulle.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texteResolu);
        logger('Message copié dans le presse-papier.', 'succes');
      } catch (err) {
        logger(`Échec de copie : ${err.message || err}`, 'erreur');
      }
    });
    const boutonLocaliserBulle = document.createElement('button');
    boutonLocaliserBulle.type = 'button';
    boutonLocaliserBulle.className = 'btn-icone';
    boutonLocaliserBulle.title = 'Localiser ce message dans la page du site';
    boutonLocaliserBulle.setAttribute('aria-label', 'Localiser ce message dans la page du site');
    boutonLocaliserBulle.innerHTML = ICONE_LOCALISER;
    boutonLocaliserBulle.addEventListener('click', async () => {
      const reponse = await envoyerAuContentScript({ type: 'fogbank:localiser-tour', index: tour.index });
      if (reponse && reponse.ok) {
        logger('Message localisé sur la page.', 'succes');
      } else {
        logger('Message introuvable sur la page (structure du site changée ?).', 'erreur');
      }
    });
    actions.append(boutonCopierBulle, boutonLocaliserBulle);

    // Vous (aligné à droite) : icônes à gauche de la bulle. Assistant
    // (aligné à gauche) : icônes à droite.
    if (tour.role === 'utilisateur') {
      ligne.append(actions, bulle);
    } else {
      ligne.append(bulle, actions);
    }
    return ligne;
  }

  // `tours` : `null`/vide → repli bloc unique ; sinon une bulle par tour,
  // dans l'ordre renvoyé par le profil de site (voir profils-lecture.js).
  function afficherHistorique(texteBrut, tours) {
    texteResoluCourant = resoudreTags(texteBrut);

    if (tours && tours.length > 0) {
      actionsRepliHistorique.hidden = true;
      sousTitreRepliHistorique.hidden = true;
      texteClair.hidden = true;
      texteClair.textContent = '';
      bullesHistorique.hidden = false;
      bullesHistorique.innerHTML = '';
      tours.forEach((tour) => {
        bullesHistorique.appendChild(construireBulle(tour, resoudreTags(tour.texte)));
      });
    } else {
      bullesHistorique.hidden = true;
      bullesHistorique.innerHTML = '';
      texteClair.hidden = false;
      texteClair.textContent = texteResoluCourant;
      actionsRepliHistorique.hidden = false;
      sousTitreRepliHistorique.hidden = false;
    }

    // Message fini d'être écrit (page stabilisée, voir fogbank:page-stable
    // plus bas) : place l'ascenseur de l'historique sur le dernier message
    // plutôt que de laisser l'utilisateur en haut du cadre à chaque mise à
    // jour.
    cadreHistorique.scrollTop = cadreHistorique.scrollHeight;
  }

  boutonLire.addEventListener('click', async () => {
    const reponse = await envoyerAuContentScript({ type: 'fogbank:lire-clair' });
    if (reponse && reponse.ok) {
      afficherHistorique(reponse.texte, reponse.tours);
    } else {
      logger(`Échec de lecture : ${(reponse && reponse.erreur) || 'réponse vide'}`, 'erreur');
    }
  });

  boutonCopierLecture.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texteResoluCourant);
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
  // le tag brut. Cas non résolu pour l'instant, voir SPECS.md. Réservé au
  // repli bloc unique — en mode bulles, chaque bulle a sa propre action
  // (voir construireBulle), plus fiable (cible le tour directement).
  boutonLocaliser.addEventListener('click', async () => {
    const selection = window.getSelection().toString().trim();
    const texte = selection || texteResoluCourant.slice(0, 200).trim();
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
      afficherHistorique(message.texte, message.tours);
    } else if (message.type === 'fogbank:modification-externe') {
      syncSuspendue = true;
      messageSuspension.hidden = false;
      logger('Modification externe détectée sur le champ du site — synchro suspendue.', 'erreur');
    }
  });

  // --- Changement d'onglet ----------------------------------------------

  async function reinitialiserPourOngletActif() {
    await determinerSite();
    majAffichageMode();
    majAffichageConversion();
    syncSuspendue = false;
    compteurEchecs = 0;
    onboardingIgnoree = false;
    messageSuspension.hidden = true;
    afficherOnboarding();
    majAccessibiliteSections();
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
