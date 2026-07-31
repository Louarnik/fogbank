// Test de non-régression pour la conversion de fichiers (M-12, voir
// docs/SPECS.md UC-006) : charge le vrai code de production
// (src/content/pseudonyme.js, src/content/conversion-fichier.js) dans un
// bac à sable Node (vm), sans navigateur, et vérifie l'aller-retour
// pseudonymiser → restaurer sur les principaux types de fichiers texte
// simples (.txt, .md, .html — voir docs/SPECS.md, Hors périmètre : pas de
// .csv ni de formats Office). Insiste sur les caractères spéciaux
// français (accents, guillemets, tiret cadratin) : le point de rupture le
// plus probable en cas de mauvaise gestion d'encodage.
//
// Lancer : node tests/conversion-fichier.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function chargerCodeProduction() {
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  ['../src/content/pseudonyme.js', '../src/content/conversion-fichier.js'].forEach((fichier) => {
    const code = fs.readFileSync(path.join(__dirname, fichier), 'utf8');
    vm.runInContext(code, sandbox, { filename: fichier });
  });
  return sandbox.window;
}

function chargerAnnuaire() {
  const donnees = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/annuaire-exemple.json'), 'utf8')
  );
  return donnees['fogbank.annuaire'];
}

// Reproduit sidepanel.js#obtenirOuCreerAlias, sans dépendance à
// chrome.storage : réutilise l'alias existant pour un site de test dédié,
// sinon en génère un nouveau et l'enregistre — même effet de bord que la
// production (voir M-10), nécessaire pour que `restaurer` retrouve
// ensuite l'entité via son historique d'alias.
function creerObtenirAlias(window, annuaire) {
  const SITE_TEST = 'site-test-conversion-fichier';
  return function obtenirOuCreerAlias(entite) {
    let entree = entite.aliasParSite.find((a) => a.siteId === SITE_TEST);
    if (entree) return entree.aliasActif;
    const alias = window.fogbankPseudonyme.genererAliasUnique(
      entite.nomReel,
      'court',
      entite.type,
      annuaire
    );
    entree = {
      siteId: SITE_TEST,
      aliasActif: alias,
      idDiscussion: null,
      historique: [{ alias, attribueLe: '2026-07-24', idDiscussion: null }],
    };
    entite.aliasParSite.push(entree);
    return alias;
  };
}

const CARACTERES_SPECIAUX = ['à', 'â', 'ä', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ö', 'ù', 'û', 'ü', 'ç', 'œ', '«', '»', '—'];

const FICHIERS = ['exemple.txt', 'exemple.md', 'exemple.html'];

function executerTests() {
  const window = chargerCodeProduction();
  let echecs = 0;
  let total = 0;

  FICHIERS.forEach((nomFichier) => {
    const annuaire = chargerAnnuaire(); // annuaire frais par fichier : pas de fuite d'alias entre les tests
    const obtenirOuCreerAlias = creerObtenirAlias(window, annuaire);
    const cheminFichier = path.join(__dirname, 'fixtures/conversion-fichier', nomFichier);
    const original = fs.readFileSync(cheminFichier, 'utf8');

    console.log(`\n--- ${nomFichier} ---`);

    // 1. Caractères spéciaux présents dans la fixture (sinon le test ne
    //    teste rien) — garde-fou contre une fixture mal formée.
    total += 1;
    const manquants = CARACTERES_SPECIAUX.filter((c) => !original.includes(c));
    if (manquants.length > 0) {
      echecs += 1;
      console.error(`ÉCHEC : fixture sans certains caractères spéciaux attendus : ${manquants.join(' ')}`);
    } else {
      console.log('OK : tous les caractères spéciaux français attendus sont présents dans la fixture.');
    }

    // 2. Pseudonymisation : chaque nom réel mentionné doit disparaître du
    //    résultat (sinon la conversion ne protège rien).
    const masque = window.fogbankConversionFichier.pseudonymiser(original, annuaire, obtenirOuCreerAlias);
    total += 1;
    const nomsRestants = annuaire.filter((e) => original.includes(e.nomReel) && masque.includes(e.nomReel));
    if (nomsRestants.length > 0) {
      echecs += 1;
      console.error(
        `ÉCHEC : nom réel encore présent après pseudonymisation : ${nomsRestants.map((e) => e.nomReel).join(', ')}`
      );
    } else {
      console.log('OK : aucun nom réel mentionné ne subsiste après pseudonymisation.');
    }

    // 3. Un tag [TYP:ALIAS] doit exister pour chaque entité mentionnée.
    total += 1;
    const entitesMentionnees = annuaire.filter((e) => original.includes(e.nomReel));
    const tagsManquants = entitesMentionnees.filter((e) => {
      const entree = e.aliasParSite.find((a) => a.siteId === 'site-test-conversion-fichier');
      return !entree || !masque.includes(`[${e.type}:${entree.aliasActif}]`);
    });
    if (tagsManquants.length > 0) {
      echecs += 1;
      console.error(`ÉCHEC : tag manquant pour ${tagsManquants.map((e) => e.nomReel).join(', ')}`);
    } else {
      console.log(`OK : ${entitesMentionnees.length} entité(s) correctement taguée(s).`);
    }

    // 4. Caractères spéciaux préservés tels quels dans le texte pseudonymisé
    //    (le texte hors noms d'entités ne doit jamais être altéré).
    total += 1;
    const specialAbsentsApresMasque = CARACTERES_SPECIAUX.filter((c) => !masque.includes(c));
    if (specialAbsentsApresMasque.length > 0) {
      echecs += 1;
      console.error(`ÉCHEC : caractères spéciaux perdus après pseudonymisation : ${specialAbsentsApresMasque.join(' ')}`);
    } else {
      console.log('OK : caractères spéciaux intacts après pseudonymisation.');
    }

    // 5. Aller-retour complet : restaurer(pseudonymiser(texte)) === texte.
    //    C'est le test le plus fort — toute corruption d'encodage ou toute
    //    entité mal résolue le fait échouer.
    const restaure = window.fogbankConversionFichier.restaurer(masque, annuaire);
    total += 1;
    if (restaure !== original) {
      echecs += 1;
      console.error('ÉCHEC : le texte restauré ne correspond pas exactement au texte original.');
      const limite = Math.min(original.length, restaure.length);
      for (let i = 0; i < limite; i += 1) {
        if (original[i] !== restaure[i]) {
          console.error(
            `  première différence à l'index ${i} : attendu ${JSON.stringify(original.slice(i, i + 30))}, obtenu ${JSON.stringify(restaure.slice(i, i + 30))}`
          );
          break;
        }
      }
    } else {
      console.log('OK : aller-retour pseudonymiser → restaurer fidèle à l\'octet près.');
    }
  });

  // 6. Régression — collision entre un tag déjà inséré et le nom réel
  //    (court) d'une entité traitée ensuite (voir bugs.md, « la taille du
  //    tag doit être au moins égale à la taille du nom en clair » ; cause
  //    réelle : substitution en plusieurs passes split/join, corrigée en
  //    une seule passe regex). Ex : le tag [PER:MDT] généré pour « Marc
  //    Damiot » contient littéralement « MDT », le nom réel d'une seconde
  //    entité traitée après lui (triée par longueur croissante) — une
  //    implémentation en plusieurs passes la substituerait *dans* ce tag.
  console.log('\n--- régression : collision tag/nom réel ---');
  {
    const annuaireCollision = [
      {
        id: 'ent-collision-01',
        type: 'PER',
        nomReel: 'Marc Damiot',
        email: null,
        creeLe: '2026-07-24',
        aliasParSite: [],
      },
      {
        id: 'ent-collision-02',
        type: 'ORG',
        nomReel: 'MDT',
        email: null,
        creeLe: '2026-07-24',
        aliasParSite: [],
      },
    ];
    const obtenirOuCreerAlias = creerObtenirAlias(window, annuaireCollision);
    const original = "Contactez Marc Damiot ou l'org MDT.";
    const masque = window.fogbankConversionFichier.pseudonymiser(original, annuaireCollision, obtenirOuCreerAlias);

    total += 1;
    const regexTag = window.fogbankPseudonyme.creerRegexTag();
    const tagsTrouves = masque.match(regexTag) || [];
    if (tagsTrouves.some((t) => /\[PER:\[/.test(t) || /\[ORG:\[/.test(t))) {
      echecs += 1;
      console.error(`ÉCHEC : tag corrompu (imbriqué) trouvé dans « ${masque} ».`);
    } else if (tagsTrouves.length !== 2) {
      echecs += 1;
      console.error(`ÉCHEC : attendu 2 tags valides, trouvé ${tagsTrouves.length} dans « ${masque} ».`);
    } else {
      console.log(`OK : deux tags valides, aucune imbrication : « ${masque} ».`);
    }

    total += 1;
    const restaure = window.fogbankConversionFichier.restaurer(masque, annuaireCollision);
    if (restaure !== original) {
      echecs += 1;
      console.error(`ÉCHEC : aller-retour infidèle — attendu « ${original} », obtenu « ${restaure} ».`);
    } else {
      console.log("OK : aller-retour pseudonymiser → restaurer fidèle malgré la collision tag/nom réel.");
    }
  }

  console.log(`\n${total - echecs}/${total} assertions passées.`);
  if (echecs > 0) {
    console.error(`\n${echecs} échec(s).`);
    process.exit(1);
  }
  console.log('\nTous les tests de conversion de fichier sont passés.');
}

executerTests();
