// Données de développement — chargées par background.js au premier
// démarrage pour éviter la saisie manuelle dans la console à chaque test
// (pas de page d'options tant que M-01/M-02 ne sont pas construits).
//
// Copie fonctionnellement identique à
// tests/fixtures/annuaire-exemple.json (hors de l'arborescence src/,
// donc illisible par l'extension chargée en "unpacked") — voir
// tests/fixtures/annuaire-exemple.README.md pour la couverture détaillée
// et les hypothèses de modélisation. Si ce fichier évolue, reporter le
// changement ici à la main.
//
// TODO : à retirer avant toute release réelle. Aucune de ces entités
// n'est une vraie personne/organisation — voir l'avertissement du JSON
// source.
export const donneesTest = {
  'fogbank.config': {
    caractereDeclencheur: '&',
  },

  'fogbank.sites': [
    {
      id: 'site-chatgpt',
      domaine: 'chatgpt.com',
      preActive: true,
      actif: true,
      creeLe: '2025-09-01',
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: true,
    },
    {
      id: 'site-claude',
      domaine: 'claude.ai',
      preActive: true,
      actif: true,
      creeLe: '2025-09-01',
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: true,
    },
    {
      id: 'site-local-test',
      domaine: 'file://tests/fixtures/mock-ai-site/',
      preActive: false,
      actif: true,
      creeLe: '2026-07-01',
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: true,
    },
    {
      id: 'site-local-test-claude',
      domaine: 'file://tests/fixtures/mock-claude-site/',
      preActive: false,
      actif: true,
      creeLe: '2026-07-01',
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: true,
    },
    {
      id: 'site-local-test-copilot',
      domaine: 'file://tests/fixtures/mock-copilot-site/',
      preActive: false,
      actif: true,
      creeLe: '2026-07-01',
      modeReplication: 'manuel',
      cibleEcriture: null,
      configurationTerminee: true,
    },
  ],

  'fogbank.annuaire': [
    {
      id: 'ent-01',
      type: 'PER',
      nomReel: 'Pierre Dupont',
      email: 'pierre.dupont@example.test',
      creeLe: '2025-10-01',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'PDT-2',
          idDiscussion: null,
          historique: [
            { alias: 'PDT', attribueLe: '2025-10-01', idDiscussion: null },
            { alias: 'PDT-2', attribueLe: '2026-01-01', idDiscussion: null },
          ],
        },
        {
          siteId: 'site-claude',
          aliasActif: 'PIDU',
          idDiscussion: null,
          historique: [{ alias: 'PIDU', attribueLe: '2026-06-10', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-02',
      type: 'PER',
      nomReel: 'Paul Dumont',
      email: null,
      creeLe: '2026-05-01',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'PDT-3',
          idDiscussion: null,
          historique: [{ alias: 'PDT-3', attribueLe: '2026-05-01', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-03',
      type: 'PER',
      nomReel: 'Marie Lefebvre',
      email: 'marie.lefebvre@example.test',
      creeLe: '2026-02-15',
      aliasParSite: [
        {
          siteId: 'site-claude',
          aliasActif: 'MALE',
          idDiscussion: null,
          historique: [{ alias: 'MALE', attribueLe: '2026-02-15', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-04',
      type: 'PER',
      nomReel: 'Jean Test',
      email: null,
      creeLe: '2026-07-15',
      aliasParSite: [
        {
          siteId: 'site-local-test',
          aliasActif: 'X7K2Q',
          idDiscussion: null,
          historique: [{ alias: 'X7K2Q', attribueLe: '2026-07-15', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-05',
      type: 'ORG',
      nomReel: 'Acme Corporation',
      email: null,
      creeLe: '2026-03-01',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'ACN',
          idDiscussion: null,
          historique: [{ alias: 'ACN', attribueLe: '2026-03-01', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-06',
      type: 'ORG',
      nomReel: 'Beta Industries',
      email: null,
      creeLe: '2026-01-10',
      aliasParSite: [
        {
          siteId: 'site-claude',
          aliasActif: 'BEIN',
          idDiscussion: null,
          historique: [{ alias: 'BEIN', attribueLe: '2026-01-10', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-07',
      type: 'LOC',
      nomReel: 'Paris',
      email: null,
      creeLe: '2026-04-01',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'PAIS',
          idDiscussion: null,
          historique: [{ alias: 'PAIS', attribueLe: '2026-04-01', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-08',
      type: 'LOC',
      nomReel: 'New York',
      email: null,
      creeLe: '2026-05-20',
      aliasParSite: [
        {
          siteId: 'site-claude',
          aliasActif: 'NEYO',
          idDiscussion: null,
          historique: [{ alias: 'NEYO', attribueLe: '2026-05-20', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-09',
      type: 'PRJ',
      nomReel: 'Projet Aurore',
      email: null,
      creeLe: '2026-06-01',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'PAE',
          idDiscussion: null,
          historique: [{ alias: 'PAE', attribueLe: '2026-06-01', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-10',
      type: 'PRJ',
      nomReel: 'Migration Phoenix',
      email: null,
      creeLe: '2026-07-18',
      aliasParSite: [
        {
          siteId: 'site-local-test',
          aliasActif: 'Q7Z3M',
          idDiscussion: null,
          historique: [{ alias: 'Q7Z3M', attribueLe: '2026-07-18', idDiscussion: null }],
        },
      ],
    },
    {
      id: 'ent-11',
      type: 'MISC',
      nomReel: 'Opération Mistral',
      email: null,
      creeLe: '2026-07-05',
      aliasParSite: [
        {
          siteId: 'site-chatgpt',
          aliasActif: 'OML',
          idDiscussion: null,
          historique: [{ alias: 'OML', attribueLe: '2026-07-05', idDiscussion: null }],
        },
      ],
    },
  ],
};
