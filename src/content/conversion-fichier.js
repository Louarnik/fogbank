// Conversion de fichiers (M-12, voir docs/SPECS.md UC-006) — logique pure,
// sans dépendance au DOM ni à chrome.*, partagée entre le panneau
// (sidepanel.js) et les tests (tests/conversion-fichier.test.js).
window.fogbankConversionFichier = (function () {
  // Pseudonymiser : remplace chaque nom réel de l'annuaire trouvé tel quel
  // par son tag [TYP:ALIAS] (alias obtenu via `obtenirAlias`, même
  // génération/rotation qu'une mention `&`, voir M-10) — noms les plus
  // longs d'abord pour ne jamais couper un nom composé au profit d'un nom
  // plus court qu'il contient (ex : "Jean Dupont" avant "Jean").
  function pseudonymiser(texte, annuaire, obtenirAlias) {
    const entites = [...annuaire].sort((a, b) => b.nomReel.length - a.nomReel.length);
    let resultat = texte;
    entites.forEach((entite) => {
      if (!entite.nomReel) return;
      const alias = obtenirAlias(entite);
      const tag = `[${entite.type}:${alias}]`;
      resultat = resultat.split(entite.nomReel).join(tag);
    });
    return resultat;
  }

  // Restaurer : résout chaque tag [TYP:ALIAS] trouvé vers le nom réel de
  // l'entité correspondante (même mécanisme que UC-002), tous sites
  // confondus (unicité globale de l'alias, voir Vue d'ensemble).
  function restaurer(texte, annuaire) {
    const regex = window.fogbankPseudonyme.creerRegexTag();
    return texte.replace(regex, (tagComplet, type, alias) => {
      const entite = window.fogbankPseudonyme.resoudreEntite(annuaire, type, alias);
      return entite ? entite.nomReel : tagComplet;
    });
  }

  return { pseudonymiser, restaurer };
})();
