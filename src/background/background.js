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

chrome.runtime.onInstalled.addListener(() => {
  console.log('[fogbank] extension installée.');
  chargerDonneesDeDeveloppement().catch((err) => {
    console.error('[fogbank] échec du chargement des données de développement :', err);
  });
});
