// Service worker de l'extension (Manifest V3).

// Ciblage du champ d'écriture (M-15, voir ADR-008 et UC-003) : clic droit
// sur un champ éditable → content/ecriture.js mémorise ce champ pour
// l'onglet (et le persiste par site), puis le side panel s'ouvre pour
// composer et répliquer (M-16, UC-004).
const MENU_CIBLER_ID = 'fogbank-ecrire-ici';

function enregistrerMenuContextuel() {
  // removeAll d'abord : create() lève une erreur si l'id existe déjà, ce
  // qui arriverait à chaque réveil du service worker sans ce nettoyage.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_CIBLER_ID,
      title: 'fogbank : écrire ici',
      contexts: ['editable'],
    });
  });
}

// Même logique de correspondance que shared/site-matching.js, dupliquée
// ici volontairement : ce fichier n'est pas un module ES (chargé par
// <script> dans les pages et par les content scripts), alors que
// background.js tourne en service worker de type "module" — les deux
// contextes ne peuvent pas partager le même fichier sans le réécrire en
// double export, pour un gain minime vu la taille de la fonction.
function correspondDomaine(site, href) {
  const motif = site.domaine.replace(/^file:\/\//, '');
  return href.includes(motif);
}

// Même désambiguïsation que options.js#genererIdSite (dupliquée ici pour la
// même raison module/script classique que correspondDomaine ci-dessus) :
// sans elle, deux domaines produisant le même slug (ex. deux sous-domaines
// réduits au même id) écraseraient silencieusement l'un l'autre.
function genererIdSite(domaine, sitesExistants) {
  const idsExistants = new Set(sitesExistants.map((s) => s.id));
  const base = `site-${domaine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')}`;
  if (!idsExistants.has(base)) return base;
  let suffixe = 2;
  while (idsExistants.has(`${base}-${suffixe}`)) suffixe += 1;
  return `${base}-${suffixe}`;
}

function aujourdHuiISO() {
  return new Date().toISOString().slice(0, 10);
}

// Entité par défaut « Paris, France » (voir UC-005, Données) : code fixe
// (pas généré par M-10), utilisée par le test d'envoi du parcours de
// configuration pour valider une résolution réelle plutôt qu'une simple
// sous-chaîne arbitraire. Présente dès l'installation, avec un alias par
// site dont `idDiscussion` est `null` (voir ADR-012) — cet alias n'est
// jamais le fruit d'un usage réel, il doit rester distinct de toute vraie
// discussion pour qu'une mention réelle de « Paris » déclenche la rotation
// paresseuse habituelle (M-08) dès sa première utilisation.
const ENTITE_PARIS_ID = 'ent-defaut-paris';
const ENTITE_PARIS_CODE = 'PA0001';

// Idempotent : mute `annuaire` en place, n'ajoute que ce qui manque
// (l'entité si absente, un alias par site de `sites` qui n'en a pas
// encore). Appelée aussi bien à l'installation (pour tous les sites déjà
// connus) qu'à la création d'un site isolé (voir assurerSiteConfigure).
function assurerAliasParisPourTousLesSites(annuaire, sites) {
  let entite = annuaire.find((e) => e.id === ENTITE_PARIS_ID);
  if (!entite) {
    entite = {
      id: ENTITE_PARIS_ID,
      type: 'LOC',
      nomReel: 'Paris, France',
      email: null,
      creeLe: aujourdHuiISO(),
      aliasParSite: [],
    };
    annuaire.push(entite);
  }
  sites.forEach((site) => {
    if (entite.aliasParSite.some((aps) => aps.siteId === site.id)) return;
    const dateRef = site.creeLe || aujourdHuiISO();
    // idDiscussion: null (voir ADR-012, même raisonnement que
    // options.js#assurerAliasParisPourSite) — distinct de toute vraie
    // discussion, pour que la rotation régénère cet alias dès la première
    // mention réelle.
    entite.aliasParSite.push({
      siteId: site.id,
      aliasActif: ENTITE_PARIS_CODE,
      idDiscussion: null,
      historique: [{ alias: ENTITE_PARIS_CODE, attribueLe: dateRef, idDiscussion: null }],
    });
  });
}

// Grands sites IA pré-activés à l'installation (M-01, voir ADR-004 et
// SPECS.md, Vue d'ensemble) : seule liste de domaines publics à maintenir
// ici, pas une donnée métier. Idempotent — n'ajoute que les domaines
// absents de `fogbank.sites`, ne touche jamais une entrée existante (un
// utilisateur a pu la désactiver ou la reconfigurer).
const DOMAINES_PRE_ACTIVES = ['chatgpt.com', 'claude.ai', 'copilot.microsoft.com'];

async function assurerSitesPreActives() {
  const donnees = await chrome.storage.local.get(['fogbank.sites']);
  const sites = donnees['fogbank.sites'] || [];
  let modifie = false;
  DOMAINES_PRE_ACTIVES.forEach((domaine) => {
    if (sites.some((s) => correspondDomaine(s, domaine))) return;
    sites.push({
      id: genererIdSite(domaine, sites),
      domaine,
      preActive: true,
      actif: true,
      creeLe: aujourdHuiISO(),
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: false,
    });
    modifie = true;
  });
  if (modifie) await chrome.storage.local.set({ 'fogbank.sites': sites });
  return sites;
}

async function assurerEntitesParDefaut() {
  const donnees = await chrome.storage.local.get(['fogbank.sites', 'fogbank.annuaire']);
  const sites = donnees['fogbank.sites'] || [];
  const annuaire = donnees['fogbank.annuaire'] || [];
  assurerAliasParisPourTousLesSites(annuaire, sites);
  await chrome.storage.local.set({ 'fogbank.annuaire': annuaire });
}

// Auto-création d'un site au premier ciblage (M-01/M-15, voir UC-005) :
// plutôt que d'exiger un passage préalable par options/ pour tout nouveau
// site, un clic droit sur un site inconnu le crée avec des réglages par
// défaut et déclenche le parcours de configuration guidé dans le panneau
// (configurationTerminee: false). Doit être résolu avant l'envoi du
// message de ciblage : sinon, la sauvegarde du ciblage et la création du
// site pourraient toutes deux relire l'ancien fogbank.sites (course entre
// deux lectures-écritures non atomiques), et l'une écraserait l'autre.
async function assurerSiteConfigure(tab) {
  if (!tab || !tab.url) return;
  let domaine;
  try {
    domaine = new URL(tab.url).hostname;
  } catch (err) {
    return;
  }
  if (!domaine) return;

  const donnees = await chrome.storage.local.get(['fogbank.sites']);
  const sites = donnees['fogbank.sites'] || [];
  if (sites.some((s) => correspondDomaine(s, tab.url))) return;

  const nouveauSite = {
    id: genererIdSite(domaine, sites),
    domaine,
    preActive: false,
    actif: true,
    creeLe: aujourdHuiISO(),
    modeReplication: 'manuel',
    cibleEcriture: null,
    configurationTerminee: false,
  };
  sites.push(nouveauSite);
  await chrome.storage.local.set({ 'fogbank.sites': sites });

  const donneesAnnuaire = await chrome.storage.local.get(['fogbank.annuaire']);
  const annuaire = donneesAnnuaire['fogbank.annuaire'] || [];
  assurerAliasParisPourTousLesSites(annuaire, [nouveauSite]);
  await chrome.storage.local.set({ 'fogbank.annuaire': annuaire });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_CIBLER_ID || !tab || !tab.id) return;
  // Doit rester le tout premier appel, synchrone, dans le geste utilisateur :
  // un await avant lui (ex. attendre la réponse du ciblage) fait perdre le
  // contexte de geste exigé par l'API, qui échoue alors silencieusement
  // (le panneau ne s'ouvre pas, sans erreur visible côté page).
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.error('[fogbank] échec d’ouverture du side panel :', err);
  });
  (async () => {
    await assurerSiteConfigure(tab);
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'fogbank:cibler' }, { frameId: info.frameId });
    } catch (err) {
      console.error('[fogbank] échec du ciblage (content script absent sur cet onglet ?) :', err);
    }
  })();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[fogbank] extension installée.');
  enregistrerMenuContextuel();
  (async () => {
    try {
      await assurerSitesPreActives();
    } catch (err) {
      console.error('[fogbank] échec de la pré-activation des sites par défaut :', err);
    }
    // Séquencé après assurerSitesPreActives (pas en parallèle) pour que les
    // sites tout juste pré-activés reçoivent aussi leur alias Paris par
    // défaut dès ce premier passage, sans attendre un second déclenchement.
    try {
      await assurerEntitesParDefaut();
    } catch (err) {
      console.error('[fogbank] échec de la création des entités par défaut :', err);
    }
  })();
});
