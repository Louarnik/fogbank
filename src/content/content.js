// Point d'entrée du content script — fail-closed (ADR-007, voir
// docs/SPECS.md UC-001/UC-002). Charge l'annuaire/config depuis
// chrome.storage.local, détermine le site courant, puis pour chaque champ
// de saisie détecté : attache l'insertion de tag (M-03/M-04) via un
// EditorHandle et le calque de décoration (M-05), avec rotation paresseuse
// (M-08) au moment de l'insertion. Aucune substitution à l'envoi (M-06
// devient vestigial : le tag est déjà ce qui est inséré dans le champ dès
// la sélection dans le menu, rien à réécrire plus tard). La restauration à
// la réception (M-07) est attachée séparément par champ, sur la zone de
// réponse associée.

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

  // Adaptateurs dédiés d'abord (sélecteurs exacts, voir docs/recherche/) —
  // le repli générique matches() toujours vrai sert de dernier recours pour
  // tout site sans adaptateur dédié.
  const ADAPTATEURS = [
    window.fogbankChatgptAdapter,
    window.fogbankClaudeAdapter,
    window.fogbankGenericAdapter,
  ].filter(Boolean);
  const adaptateur = ADAPTATEURS.find((a) => a.matches()) || window.fogbankGenericAdapter;

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

  // Résilience (SPA) : un composer React (ChatGPT, Claude.ai...) peut se
  // monter après ce premier passage — ce content script ne s'exécute
  // qu'une fois, à document_idle — et une zone de réponse peut elle-même
  // ne pas encore exister (nouvelle conversation sans aucun tour envoyé).
  // Sans repasser périodiquement sur getInputFields()/getResponseContainer,
  // ces cas ne seraient jamais câblés du tout. `champsTraites` /
  // `champsAvecReception` évitent tout double câblage à chaque repassage.
  const champsTraites = new WeakSet();
  const champsAvecReception = new WeakSet();
  // Dédoublonnage par conteneur (pas seulement par champ) : plusieurs champs
  // détectés peuvent résoudre à la même zone de réponse (ex. la fixture
  // mock-claude-site, qui a un second contenteditable — renommage de
  // conversation — dont l'ancêtre climbing de generic.js aboutit au même
  // conteneur que le vrai composer). Sans ce dédoublonnage, un même
  // conteneur recevrait un MutationObserver par champ, chacun retraitant le
  // même contenu.
  const conteneursAvecReception = new WeakSet();

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

  function attacherReception(champ) {
    try {
      // UC-002 : restauration à la réception (M-07), une zone de réponse
      // par champ détecté (utile notamment pour la fixture qui présente
      // deux scénarios de saisie indépendants sur la même page).
      const zoneReponse = adaptateur.getResponseContainer
        ? adaptateur.getResponseContainer(champ)
        : null;
      if (zoneReponse) {
        champsAvecReception.add(champ);
        if (!conteneursAvecReception.has(zoneReponse)) {
          conteneursAvecReception.add(zoneReponse);
          window.fogbankReception.observer(zoneReponse, adaptateur, resoudre);
        }
      }
    } catch (err) {
      console.error('[fogbank] échec du câblage de la réception pour un champ :', err);
    }
  }

  function traiterChamps() {
    const champs = adaptateur.getInputFields ? adaptateur.getInputFields() : [];
    champs.forEach((champ) => {
      if (!champsTraites.has(champ)) {
        champsTraites.add(champ);
        attacherChamp(champ);
      }
      if (!champsAvecReception.has(champ)) {
        attacherReception(champ);
      }
    });
  }

  traiterChamps();

  // Repassage à chaque rafale de mutations du document (composer monté
  // tardivement, premier message envoyé qui fait apparaître la zone de
  // réponse...) — coalescé pour ne pas repasser sur getInputFields() à
  // chaque nœud individuel pendant un streaming de réponse.
  let repassagePlanifie = false;
  const observateurDom = new MutationObserver(() => {
    if (repassagePlanifie) return;
    repassagePlanifie = true;
    setTimeout(() => {
      repassagePlanifie = false;
      traiterChamps();
    }, 200);
  });
  observateurDom.observe(document.body, { childList: true, subtree: true });
})();
