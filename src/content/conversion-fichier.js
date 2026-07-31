// Conversion de fichiers (M-12, voir docs/SPECS.md UC-006) — logique pure,
// sans dépendance au DOM ni à chrome.*, partagée entre le panneau
// (sidepanel.js) et les tests (tests/conversion-fichier.test.js).
window.fogbankConversionFichier = (function () {
  function echapperRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Pseudonymiser : remplace chaque nom réel de l'annuaire trouvé tel quel
  // par son tag [TYP:ALIAS] (alias obtenu via `obtenirAlias`, même
  // génération/rotation qu'une mention `&`, voir M-10). Une seule passe de
  // remplacement (regex d'alternance, noms les plus longs d'abord) plutôt
  // qu'un split/join par entité : avec plusieurs passes séquentielles, le
  // tag déjà inséré pour une entité au nom long peut contenir comme sous-
  // chaîne le nom réel (court) d'une entité traitée ensuite — celle-ci le
  // remplacerait alors *à l'intérieur* du tag déjà posé, le corrompant
  // (ex : entité « MDT » substituée dans le tag [PER:MDT] qui vient d'être
  // inséré pour « Marc Damiot »). Une seule passe ne rescanne jamais le
  // texte déjà substitué, donc ce cas ne peut plus se produire. Trier du
  // plus long au plus court reste nécessaire pour ne pas couper un nom
  // composé au profit d'un nom plus court qu'il contient (ex : "Jean
  // Dupont" avant "Jean").
  function pseudonymiser(texte, annuaire, obtenirAlias) {
    const entites = [...annuaire]
      .filter((e) => e.nomReel)
      .sort((a, b) => b.nomReel.length - a.nomReel.length);
    if (entites.length === 0) return texte;

    const tagParNom = new Map();
    const motifs = [];
    entites.forEach((entite) => {
      tagParNom.set(entite.nomReel, `[${entite.type}:${obtenirAlias(entite)}]`);
      motifs.push(echapperRegex(entite.nomReel));
    });

    const regex = new RegExp(motifs.join('|'), 'g');
    return texte.replace(regex, (nomTrouve) => tagParNom.get(nomTrouve));
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
