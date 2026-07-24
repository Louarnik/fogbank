// Calque de décoration (M-05) — voir ADR-008 et docs/SPECS.md UC-001.
// Attaché au champ de composition du side panel, qui contient l'entité
// (nom réel) en clair (le tag [TYP:ALIAS] n'existe qu'à la réplication vers
// le site — voir UC-004) : ce module ne fait que signaler visuellement
// qu'un nom est une mention suivie par fogbank, sans jamais rien écrire
// dans le champ :
// - une infobulle au survol montrant le tag `[TYP:ALIAS]` correspondant ;
// - un soulignement peint par-dessus le nom, positionné via
//   EditorHandle.getRangeRects.
// Les zones décorées viennent de `options.obtenirMentions()` (suivi par
// position, voir mention-menu.js) — ce module ne reparse pas le texte du
// champ pour les retrouver, il n'y a plus de motif structurel à y chercher.
//
// Cloisonnement : une seule racine shadow DOM **fermée**, hôte anodin,
// aucune ressource externe, pointer-events: none partout — le site ne peut
// ni la lire ni la voir dans ses mutations (protection contre les outils de
// rejeu de session type FullStory/Clarity/rrweb).
//
// Non couvert dans cette itération (limitations connues, pas des oublis) :
// détection du thème du site par luminance (une couleur fixe est
// utilisée), région aria-live, parité clavier pour l'infobulle,
// prefers-reduced-transparency/motion.
window.fogbankDisplay = (function () {
  const DELAI_OUVERTURE_MS = 180;
  const DELAI_FERMETURE_MS = 100;

  let racineOmbre = null;

  // Racine anodine (ni id ni class identifiable) accrochée à
  // document.documentElement, en mode shadow "closed" (même l'extension ne
  // peut pas relire hote.shadowRoot depuis l'extérieur de cette closure —
  // protection contre d'autres extensions).
  function obtenirRacine() {
    if (racineOmbre) return racineOmbre;
    const hote = document.createElement('div');
    hote.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    document.documentElement.appendChild(hote);
    racineOmbre = hote.attachShadow({ mode: 'closed' });

    // Styles par adoptedStyleSheets, pas de <style> dupliqué. Le trait ne
    // porte que des propriétés de peinture : border-bottom seulement,
    // jamais padding/margin/font-*/letter-spacing qui décalerait les
    // glyphes du champ réel.
    const feuille = new CSSStyleSheet();
    feuille.replaceSync(`
      .fb-trait {
        position: fixed;
        pointer-events: none;
        border-bottom: 2px solid #2d6cdf;
      }
      .fb-bulle {
        position: fixed;
        max-width: 16rem;
        white-space: nowrap;
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
      .fb-bulle[data-ouvert] { opacity: 1; transform: none; }
    `);
    racineOmbre.adoptedStyleSheets = [feuille];
    return racineOmbre;
  }

  // Attache la décoration à un champ déjà pourvu de son EditorHandle.
  // `options.obtenirMentions()` doit renvoyer les mentions actuellement
  // suivies pour ce champ : `[{ debut, fin, entite, code }]` (voir
  // mention-menu.js, valeur retournée par son propre `attacher()`).
  function attacher(champ, handle, options) {
    const racine = obtenirRacine();

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
      // Le nom réel est déjà visible dans le champ (le panneau est en
      // clair) : l'infobulle montre l'inverse, le tag qui sera envoyé au
      // site à la réplication (UC-004) — utile pour vérifier/expliquer.
      bulle.textContent = `[${zone.entite.type}:${zone.alias}]`;
      // Placement sous le trait, bascule au-dessus si la place manque en
      // bas de la fenêtre : sans ça, un tag proche du bas du
      // viewport pousse l'infobulle hors écran plutôt que de l'afficher.
      const hauteurBulle = bulle.offsetHeight;
      const placeSousLeTrait = window.innerHeight - rect.bottom - 4;
      bulle.style.top =
        hauteurBulle > placeSousLeTrait && rect.top - hauteurBulle - 4 > 0
          ? `${rect.top - hauteurBulle - 4}px`
          : `${rect.bottom + 4}px`;
      bulle.style.left = `${Math.max(0, rect.left)}px`;
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

    function rendreTraits() {
      nettoyerTraits();
      zones.forEach((zone) => {
        handle.getRangeRects(zone.debut, zone.fin).forEach((r) => {
          const trait = document.createElement('div');
          trait.className = 'fb-trait';
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
      zones = options.obtenirMentions();
      rendreTraits();
    }

    // Détection du survol par rectangles déjà calculés : pas de
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
        // Tag césuré : ancrer l'infobulle sur le dernier rectangle
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
        if (bulle) bulle.remove();
      },
    };
  }

  return { attacher };
})();
