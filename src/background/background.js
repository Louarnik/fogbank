// Service worker de l'extension (Manifest V3).
import { donneesTest } from './donnees-test.js';

// Chargement de développement : évite de repeupler chrome.storage.local à
// la main dans la console à chaque test (pas de page d'options tant que
// M-01/M-02 ne sont pas construits). Voir
// tests/fixtures/annuaire-exemple.README.md et donnees-test.js.
//
// Fusionne plutôt que d'écraser en bloc : un développeur qui a déjà de
// l'annuaire en storage (testé avant l'ajout de ce mécanisme, ou avant
// l'ajout d'une nouvelle fixture à donnees-test.js) doit quand même
// récupérer les entrées manquantes — sites ou entités — sans perdre ses
// propres modifications sur celles qui existent déjà (identifiées par
// `id`, jamais réécrites si déjà présentes).
//
// TODO : à retirer avant toute release réelle (voir donnees-test.js).
async function chargerDonneesDeDeveloppement() {
  const existant = await chrome.storage.local.get([
    'fogbank.config',
    'fogbank.sites',
    'fogbank.annuaire',
  ]);

  const fusionnerParId = (existants, apport) => {
    const idsExistants = new Set((existants || []).map((e) => e.id));
    const manquants = apport.filter((e) => !idsExistants.has(e.id));
    return [...(existants || []), ...manquants];
  };

  const sites = fusionnerParId(existant['fogbank.sites'], donneesTest['fogbank.sites']);
  const annuaire = fusionnerParId(existant['fogbank.annuaire'], donneesTest['fogbank.annuaire']);
  const config = existant['fogbank.config'] || donneesTest['fogbank.config'];

  // Migration ponctuelle : le trigramme LIE a été renommé en LOC (ADR-003,
  // alignement sur le schéma NER standard). Le mécanisme de fusion
  // ci-dessus n'ajoute que les entités manquantes — il ne corrige pas les
  // champs d'une entité déjà en storage depuis avant ce renommage, d'où
  // les entités de type lieu (ex. "Paris") qui restaient bloquées sur
  // l'ancien code et ne matchaient plus la regex de tag partagée
  // (pseudonyme.js n'accepte plus que PER/ORG/LOC/PRJ/MISC).
  annuaire.forEach((entite) => {
    if (entite.type === 'LIE') entite.type = 'LOC';
  });

  await chrome.storage.local.set({
    'fogbank.config': config,
    'fogbank.sites': sites,
    'fogbank.annuaire': annuaire,
  });
  console.log(
    '[fogbank] données de développement synchronisées (annuaire de test + sites, dont les fixtures locales manquantes ajoutées si besoin).'
  );
}

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

function genererIdSite(domaine) {
  return `site-${domaine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')}`;
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

  sites.push({
    id: genererIdSite(domaine),
    domaine,
    preActive: false,
    actif: true,
    dureeViePseudonyme: '1a',
    formatPseudonyme: 'court',
    modeReplication: 'manuel',
    cibleEcriture: null,
    configurationTerminee: false,
  });
  await chrome.storage.local.set({ 'fogbank.sites': sites });
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
  chargerDonneesDeDeveloppement().catch((err) => {
    console.error('[fogbank] échec du chargement des données de développement :', err);
  });
});
