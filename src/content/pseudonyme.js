// Génération de l'alias de pseudonyme (M-10) — voir ADR-002 (formats et
// collision) et ADR-003 (repli nom à un seul mot, encore provisoire).
// Vocabulaire : voir ADR-010 (entité / alias / tag, substitute()/resolve()).
// Partagé entre mention-menu.js (création à la mention) et content.js
// (rotation paresseuse à l'envoi, M-08).
window.fogbankPseudonyme = (function () {
  function normaliserMot(mot) {
    return mot
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // retire les accents (marques combinantes Unicode)
      .replace(/[^a-zA-Z]/g, '')
      .toUpperCase();
  }

  function decouperMots(nomReel) {
    return nomReel
      .trim()
      .split(/\s+/)
      .map(normaliserMot)
      .filter((m) => m.length > 0);
  }

  // Format court : initiale(premier mot) + initiale(dernier mot) +
  // dernière lettre(dernier mot). Repli sur un nom à un seul mot (ADR-003,
  // point ouvert) : 2 premières + 2 dernières lettres du mot unique.
  function genererCourt(nomReel) {
    const mots = decouperMots(nomReel);
    if (mots.length === 0) return '';
    if (mots.length === 1) {
      const mot = mots[0];
      if (mot.length <= 4) return mot;
      return mot.slice(0, 2) + mot.slice(-2);
    }
    const premier = mots[0];
    const dernier = mots[mots.length - 1];
    return premier[0] + dernier[0] + dernier[dernier.length - 1];
  }

  // Format étendu : 2 premières lettres (premier mot) + 2 premières
  // lettres (dernier mot). Même repli que le format court pour un nom à
  // un seul mot (non spécifié explicitement dans l'ADR-002, à confirmer).
  function genererEtendu(nomReel) {
    const mots = decouperMots(nomReel);
    if (mots.length === 0) return '';
    if (mots.length === 1) return genererCourt(nomReel);
    const premier = mots[0];
    const dernier = mots[mots.length - 1];
    return premier.slice(0, 2) + dernier.slice(0, 2);
  }

  function genererOpaque() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let alias = '';
    for (let i = 0; i < 5; i++) {
      alias += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return alias;
  }

  function genererAliasBrut(nomReel, format) {
    if (format === 'etendu') return genererEtendu(nomReel);
    if (format === 'opaque') return genererOpaque();
    return genererCourt(nomReel);
  }

  // Unicité globale par type (pas par site) — voir ARCHITECTURE.md et
  // ADR-002 : nécessaire pour que M-12 résolve un tag [TYP:ALIAS] sans
  // connaître le site d'origine.
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

  function genererAliasUnique(nomReel, format, type, annuaire) {
    const base = genererAliasBrut(nomReel, format);
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
  // logique d'unicité globale que genererAliasUnique. Réutilisée telle
  // quelle par M-12 (conversion manuelle, hors contexte de site).
  function resoudreEntite(annuaire, type, alias) {
    return (
      annuaire.find(
        (e) =>
          e.type === type &&
          e.aliasParSite.some((aps) => aps.historique.some((h) => h.alias === alias))
      ) || null
    );
  }

  // Regex de tag partagée (UC-001 calque, UC-002 restauration, M-12) — voir
  // docs/SPECS.md. Une factory plutôt qu'une constante : une regex globale
  // (`g`) porte un `lastIndex` mutable, dangereux à partager entre appelants
  // qui l'utilisent en parallèle ou de façon imbriquée.
  function creerRegexTag() {
    return /\[(PER|ORG|LOC|PRJ|MISC):([A-Z0-9]+(?:-\d+)?)\]/g;
  }

  return { genererAliasUnique, resoudreEntite, creerRegexTag };
})();
