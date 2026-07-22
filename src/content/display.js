// Calque de décoration (M-05, fail-closed) — voir ADR-007 et docs/SPECS.md
// UC-001. Le champ contient le tag [TYP:CODE] en clair, jamais le vrai nom ;
// ce module se contente de le RÉVÉLER à l'affichage, sans jamais rien écrire
// dans le champ ni dans le DOM du site (règle cardinale, R-31) :
// - une légende sous le champ (base, R-43) : une ligne par tag présent ;
// - une infobulle au survol (raffinement, R-34/R-38) ;
// - un soulignement peint par-dessus le texte (R-32/R-33), positionné via
//   EditorHandle.getRangeRects — identique pour <textarea> et
//   contenteditable, toute la différence étant encapsulée dans l'EditorHandle.
//
// Cloisonnement (R-25 à R-30) : une seule racine shadow DOM **fermée**,
// hôte anodin, aucune ressource externe, pointer-events: none partout — le
// site ne peut ni la lire ni la voir dans ses mutations (protection contre
// les outils de rejeu de session type FullStory/Clarity/rrweb, voir ADR-007).
//
// Non couvert dans cette itération (limitations connues, pas des oublis) :
// détection du thème du site par luminance (R-35, une couleur fixe est
// utilisée), région aria-live (R-45), parité clavier pour l'infobulle
// (R-44 — la légende reste lisible sans survol, ce qui couvre le besoin de
// base), prefers-reduced-transparency/motion (R-46).
window.fogbankDisplay = (function () {
  const DELAI_OUVERTURE_MS = 180;
  const DELAI_FERMETURE_MS = 100;

  const LIBELLES_TYPE = { PER: 'Personne', ORG: 'Organisation', LIE: 'Lieu', PRJ: 'Projet' };

  let racineOmbre = null;

  // Racine anodine (R-27 : ni id ni class identifiable) accrochée à
  // document.documentElement, en mode shadow "closed" (R-25 : même
  // l'extension ne peut pas relire hote.shadowRoot depuis l'extérieur de
  // cette closure — protection contre d'autres extensions).
  function obtenirRacine() {
    if (racineOmbre) return racineOmbre;
    const hote = document.createElement('div');
    hote.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    document.documentElement.appendChild(hote);
    racineOmbre = hote.attachShadow({ mode: 'closed' });

    // Styles par adoptedStyleSheets (R-29), pas de <style> dupliqué. Le
    // trait ne porte que des propriétés de peinture (R-32) : border-bottom
    // seulement, jamais padding/margin/font-*/letter-spacing qui décalerait
    // les glyphes du champ réel.
    const feuille = new CSSStyleSheet();
    feuille.replaceSync(`
      .fb-trait {
        position: fixed;
        pointer-events: none;
        border-bottom: 2px solid #2d6cdf;
      }
      .fb-trait[data-invalide] {
        border-bottom-style: dotted;
        border-bottom-color: #d33;
      }
      .fb-bulle {
        position: fixed;
        max-width: 20rem;
        padding: .5rem .625rem;
        border-radius: .5rem;
        font: 500 12.5px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
        pointer-events: none;
        opacity: 0;
        transform: translateY(2px);
        transition: opacity .12s ease, transform .12s ease;
        color: #f4f4f5;
        background: rgba(24, 24, 27, .92);
        border: 1px solid rgba(255, 255, 255, .14);
        box-shadow: 0 6px 24px rgba(0, 0, 0, .35);
        -webkit-backdrop-filter: blur(14px) saturate(160%);
        backdrop-filter: blur(14px) saturate(160%);
      }
      .fb-bulle div { margin: 0; }
      .fb-bulle[data-ouvert] { opacity: 1; transform: none; }
      .fb-legende {
        position: fixed;
        pointer-events: none;
        font: 12px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
        color: #555;
      }
      .fb-legende div { white-space: nowrap; }
      .fb-legende code {
        color: #2d6cdf;
        font-family: ui-monospace, monospace;
      }
      .fb-legende .fb-inconnu code { color: #d33; }
    `);
    racineOmbre.adoptedStyleSheets = [feuille];
    return racineOmbre;
  }

  // Détecte tous les tags complets présents dans `texte` et les résout via
  // `resoudre(type, code)`. Un tag incomplet (`[PER:PD`, pas encore de
  // crochet fermant) ne matche simplement pas — pas de marquage prématuré.
  function analyserTags(texte, resoudre) {
    const regex = window.fogbankPseudonyme.creerRegexTag();
    const zones = [];
    let m = regex.exec(texte);
    while (m) {
      const [tagComplet, type, code] = m;
      zones.push({
        debut: m.index,
        fin: m.index + tagComplet.length,
        type,
        code,
        entite: resoudre(type, code),
      });
      m = regex.exec(texte);
    }
    return zones;
  }

  // Attache la décoration à un champ déjà pourvu de son EditorHandle.
  // `options.resoudre(type, code)` doit renvoyer l'entité correspondante ou
  // null (voir fogbankPseudonyme.resoudreEntite).
  function attacher(champ, handle, options) {
    const racine = obtenirRacine();

    const legende = document.createElement('div');
    legende.className = 'fb-legende';
    legende.style.display = 'none';
    racine.appendChild(legende);

    let bulle = null;
    let minuteur = null;
    let traits = [];
    let zones = [];
    let frame = 0;

    function ouvrirBulle(zone, rect) {
      if (!bulle) {
        bulle = document.createElement('div');
        bulle.className = 'fb-bulle';
        racine.appendChild(bulle);
      }
      bulle.textContent = '';
      const lignes = zone.entite
        ? [zone.entite.nomReel, LIBELLES_TYPE[zone.type], zone.entite.email].filter(Boolean)
        : ['Pseudonyme inconnu'];
      lignes.forEach((texteLigne) => {
        const ligne = document.createElement('div');
        ligne.textContent = texteLigne;
        bulle.appendChild(ligne);
      });
      bulle.style.left = `${Math.max(0, rect.left)}px`;
      bulle.style.top = `${rect.bottom + 4}px`;
      bulle.setAttribute('data-ouvert', '');
    }

    function fermerBulle() {
      if (bulle) bulle.removeAttribute('data-ouvert');
    }

    function programmerOuverture(zone, rect) {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => ouvrirBulle(zone, rect), DELAI_OUVERTURE_MS);
    }

    function programmerFermeture() {
      clearTimeout(minuteur);
      minuteur = setTimeout(fermerBulle, DELAI_FERMETURE_MS);
    }

    function nettoyerTraits() {
      traits.forEach((t) => t.remove());
      traits = [];
    }

    function rendreLegende() {
      legende.textContent = '';
      if (zones.length === 0) {
        legende.style.display = 'none';
        return;
      }
      legende.style.display = 'block';
      zones.forEach((zone) => {
        const ligne = document.createElement('div');
        if (!zone.entite) ligne.className = 'fb-inconnu';
        const code = document.createElement('code');
        code.textContent = `[${zone.type}:${zone.code}]`;
        ligne.appendChild(code);
        ligne.appendChild(document.createTextNode(' → '));
        ligne.appendChild(
          document.createTextNode(zone.entite ? zone.entite.nomReel : 'pseudonyme inconnu')
        );
        legende.appendChild(ligne);
      });
      const rect = champ.getBoundingClientRect();
      legende.style.left = `${rect.left}px`;
      legende.style.top = `${rect.bottom + 6}px`;
    }

    function rendreTraits() {
      nettoyerTraits();
      zones.forEach((zone) => {
        handle.getRangeRects(zone.debut, zone.fin).forEach((r) => {
          const trait = document.createElement('div');
          trait.className = 'fb-trait';
          if (!zone.entite) trait.setAttribute('data-invalide', '');
          trait.style.left = `${r.left}px`;
          trait.style.top = `${r.top}px`;
          trait.style.width = `${r.width}px`;
          trait.style.height = `${r.height}px`;
          racine.appendChild(trait);
          traits.push(trait);
        });
      });
    }

    function rendre() {
      zones = analyserTags(handle.getText(), options.resoudre);
      rendreLegende();
      rendreTraits();
    }

    // Détection du survol par rectangles déjà calculés (R-36) : pas de
    // caretRangeFromPoint, pas de recherche dichotomique — throttlé par
    // requestAnimationFrame.
    champ.addEventListener('mousemove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        let zoneSurvolee = null;
        let rectsZone = null;
        for (const zone of zones) {
          const rects = handle.getRangeRects(zone.debut, zone.fin);
          if (
            rects.some(
              (r) =>
                e.clientX >= r.left &&
                e.clientX <= r.right &&
                e.clientY >= r.top &&
                e.clientY <= r.bottom
            )
          ) {
            zoneSurvolee = zone;
            rectsZone = rects;
            break;
          }
        }
        // Tag césuré (R-37) : ancrer l'infobulle sur le dernier rectangle
        // (le plus bas), pas le premier.
        if (zoneSurvolee) {
          programmerOuverture(zoneSurvolee, rectsZone[rectsZone.length - 1]);
        } else {
          programmerFermeture();
        }
      });
    });

    ['scroll', 'blur', 'wheel'].forEach((evt) =>
      champ.addEventListener(evt, programmerFermeture, { passive: true })
    );

    const arreterOnInput = handle.onInput(rendre);
    window.addEventListener('resize', rendre);
    window.addEventListener('scroll', rendre, { capture: true, passive: true });
    if (window.ResizeObserver) {
      // Un <textarea> est redimensionnable manuellement (poignée CSS
      // resize) — le miroir seul ne suit pas ce changement de taille.
      new ResizeObserver(rendre).observe(champ);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(rendre);
    }

    rendre();

    return {
      rafraichir: rendre,
      detacher() {
        arreterOnInput();
        window.removeEventListener('resize', rendre);
        window.removeEventListener('scroll', rendre, { capture: true });
        nettoyerTraits();
        legende.remove();
        if (bulle) bulle.remove();
      },
    };
  }

  return { attacher };
})();
