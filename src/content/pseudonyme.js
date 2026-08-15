// Génération de l'alias de pseudonyme (M-10) — voir ADR-002. Sur cette
// branche, un seul format : opaque (aléatoire, sans lien visuel avec le nom
// réel) — les formats reconnaissables (court/étendu) et le choix par site
// vivent sur feature/choix-rotation-format.
// Vocabulaire : voir ADR-010 (entité / alias / tag, substitute()/resolve()).
// Partagé entre mention-menu.js (création à la mention) et content.js
// (rotation paresseuse à l'envoi, M-08).
window.fogbankPseudonyme = (function () {
  function genererOpaque() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let alias = '';
    for (let i = 0; i < 5; i++) {
      alias += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return alias;
  }

  // Unicité globale par type (pas par site) — voir ARCHITECTURE.md et
  // ADR-002.
  function aliasExistants(annuaire, type) {
    const alias = new Set();
    annuaire
      .filter((e) => e.type === type)
      .forEach((e) => {
        e.aliasParSite.forEach((aps) => {
          aps.historique.forEach((h) => alias.add(h.alias));
        });
      });
    return alias;
  }

  function genererAliasUnique(type, annuaire) {
    const base = genererOpaque();
    const existants = aliasExistants(annuaire, type);
    if (!existants.has(base)) return base;
    let suffixe = 2;
    let candidat = `${base}-${suffixe}`;
    while (existants.has(candidat)) {
      suffixe += 1;
      candidat = `${base}-${suffixe}`;
    }
    return candidat;
  }

  // Résolution inverse (M-07/UC-002) : retrouve l'entité portant cet ALIAS
  // pour ce type, tous sites confondus (actif ou historique) — même
  // logique d'unicité globale que genererAliasUnique.
  function resoudreEntite(annuaire, type, alias) {
    return (
      annuaire.find(
        (e) =>
          e.type === type &&
          e.aliasParSite.some((aps) => aps.historique.some((h) => h.alias === alias))
      ) || null
    );
  }

  // Regex de tag partagée (UC-001 calque, UC-002 restauration) — voir
  // docs/SPECS.md. Une factory plutôt qu'une constante : une regex globale
  // (`g`) porte un `lastIndex` mutable, dangereux à partager entre appelants
  // qui l'utilisent en parallèle ou de façon imbriquée.
  function creerRegexTag() {
    return /\[(PER|ORG|LOC|PRJ|MISC):([A-Z0-9]+(?:-\d+)?)\]/g;
  }

  // Résout chaque tag [TYP:ALIAS] complet trouvé dans un texte vers le nom
  // réel de l'entité correspondante (M-07/UC-002) — un tag inconnu reste
  // affiché tel quel.
  function resoudreTexte(texte, annuaire) {
    return texte.replace(creerRegexTag(), (tagComplet, type, alias) => {
      const entite = resoudreEntite(annuaire, type, alias);
      return entite ? entite.nomReel : tagComplet;
    });
  }

  return { genererAliasUnique, resoudreEntite, creerRegexTag, resoudreTexte };
})();
