// Page d'options — deux onglets, deux CRUD indépendants :
// - Annuaire (fogbank.annuaire, M-12). Les alias par site (aliasParSite)
//   restent en lecture seule ici : ils ne sont produits que par la rotation
//   paresseuse (M-08/M-10) au fil de l'usage dans le panneau (sidepanel/),
//   jamais saisis à la main.
// - Sites (fogbank.sites, M-01). Un site désactivé n'est jamais câblé par
//   content/ecriture.js ; la popup offre un raccourci pour basculer
//   actif/inactif sur l'onglet en cours sans passer par ici. Mode de
//   réplication (M-16) et ciblage mémorisé (M-15, voir ADR-008) modifiables
//   ici aussi.
(function () {
  const LIBELLES_DUREE = { '1s': '1 semaine', '1t': '1 trimestre', '1a': '1 an', infini: 'Infinie' };
  const LIBELLES_FORMAT = { court: 'Court', etendu: 'Étendu', opaque: 'Opaque' };

  // Entité par défaut « Paris, France » (voir UC-005, Données) — même
  // logique qu'en background.js, dupliquée volontairement (options.js est
  // un script classique chargé par <script>, background.js un module de
  // service worker ; voir la note équivalente dans background.js).
  const ENTITE_PARIS_ID = 'ent-defaut-paris';
  const ENTITE_PARIS_CODE = 'PA0001';

  function assurerAliasParisPourSite(annuaireActuel, site) {
    let entite = annuaireActuel.find((e) => e.id === ENTITE_PARIS_ID);
    if (!entite) {
      entite = {
        id: ENTITE_PARIS_ID,
        type: 'LOC',
        nomReel: 'Paris, France',
        email: null,
        creeLe: site.creeLe,
        aliasParSite: [],
      };
      annuaireActuel.push(entite);
    }
    if (entite.aliasParSite.some((aps) => aps.siteId === site.id)) return;
    entite.aliasParSite.push({
      siteId: site.id,
      aliasActif: ENTITE_PARIS_CODE,
      expireLe: site.creeLe,
      historique: [{ alias: ENTITE_PARIS_CODE, attribueLe: site.creeLe, expireLe: site.creeLe }],
    });
  }

  let annuaire = [];
  let sites = [];
  let filtreActif = '';
  let idEnEdition = null; // null = création, sinon id de l'entité éditée
  let idSiteEnEdition = null; // null = création, sinon id du site édité

  // --- Onglets ---------------------------------------------------------
  const boutonOngletAnnuaire = document.getElementById('onglet-bouton-annuaire');
  const boutonOngletSites = document.getElementById('onglet-bouton-sites');
  const sectionAnnuaire = document.getElementById('onglet-annuaire');
  const sectionSites = document.getElementById('onglet-sites');

  function activerOnglet(nom) {
    const estSites = nom === 'sites';
    sectionAnnuaire.hidden = estSites;
    sectionSites.hidden = !estSites;
    boutonOngletAnnuaire.setAttribute('aria-selected', String(!estSites));
    boutonOngletSites.setAttribute('aria-selected', String(estSites));
  }
  boutonOngletAnnuaire.addEventListener('click', () => {
    location.hash = '';
    activerOnglet('annuaire');
  });
  boutonOngletSites.addEventListener('click', () => {
    location.hash = 'sites';
    activerOnglet('sites');
  });
  activerOnglet(location.hash === '#sites' ? 'sites' : 'annuaire');

  // --- Onglet Annuaire ---------------------------------------------------
  const corpsTableau = document.getElementById('corps-tableau');
  const etatVide = document.getElementById('etat-vide');
  const champFiltre = document.getElementById('filtre');
  const boutonAjouter = document.getElementById('bouton-ajouter');
  const dialogue = document.getElementById('dialogue-formulaire');
  const formulaire = document.getElementById('formulaire-entite');
  const titreFormulaire = document.getElementById('titre-formulaire');
  const champType = document.getElementById('champ-type');
  const champNom = document.getElementById('champ-nom');
  const champEmail = document.getElementById('champ-email');
  const erreurFormulaire = document.getElementById('erreur-formulaire');
  const boutonAnnuler = document.getElementById('bouton-annuler');

  function nomSite(siteId) {
    const site = sites.find((s) => s.id === siteId);
    return site ? site.domaine : siteId;
  }

  function genererIdEntite() {
    const numeros = annuaire
      .map((e) => /^ent-(\d+)$/.exec(e.id))
      .filter(Boolean)
      .map((m) => parseInt(m[1], 10));
    const suivant = (numeros.length ? Math.max(...numeros) : 0) + 1;
    return `ent-${String(suivant).padStart(2, '0')}`;
  }

  function celluleAlias(entite) {
    if (entite.aliasParSite.length === 0) {
      const span = document.createElement('span');
      span.className = 'alias-vide';
      span.textContent = 'aucun alias encore attribué';
      return span;
    }
    const conteneur = document.createElement('div');
    entite.aliasParSite.forEach((aps) => {
      const ligne = document.createElement('span');
      ligne.className = 'alias-site';
      const code = document.createElement('code');
      code.textContent = aps.aliasActif;
      ligne.appendChild(document.createTextNode(`${nomSite(aps.siteId)} → `));
      ligne.appendChild(code);
      if (aps.expireLe) {
        ligne.appendChild(document.createTextNode(` (expire ${aps.expireLe})`));
      }
      conteneur.appendChild(ligne);
    });
    return conteneur;
  }

  function rendreTableau() {
    corpsTableau.textContent = '';
    const filtre = filtreActif.trim().toLowerCase();
    const entites = annuaire
      .filter((e) => !filtre || e.nomReel.toLowerCase().includes(filtre))
      .sort((a, b) => a.nomReel.localeCompare(b.nomReel, 'fr'));

    etatVide.hidden = entites.length > 0;

    entites.forEach((entite) => {
      const ligne = document.createElement('tr');

      const tdType = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = entite.type;
      tdType.appendChild(code);
      ligne.appendChild(tdType);

      const tdNom = document.createElement('td');
      tdNom.textContent = entite.nomReel;
      ligne.appendChild(tdNom);

      const tdEmail = document.createElement('td');
      tdEmail.textContent = entite.email || '—';
      ligne.appendChild(tdEmail);

      const tdCree = document.createElement('td');
      tdCree.textContent = entite.creeLe || '—';
      ligne.appendChild(tdCree);

      const tdAlias = document.createElement('td');
      tdAlias.appendChild(celluleAlias(entite));
      ligne.appendChild(tdAlias);

      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const boutonEditer = document.createElement('button');
      boutonEditer.type = 'button';
      boutonEditer.className = 'bouton-icone';
      boutonEditer.textContent = 'Modifier';
      boutonEditer.addEventListener('click', () => ouvrirFormulaire(entite));
      tdActions.appendChild(boutonEditer);

      const boutonSupprimer = document.createElement('button');
      boutonSupprimer.type = 'button';
      boutonSupprimer.className = 'bouton-icone danger';
      boutonSupprimer.textContent = 'Supprimer';
      boutonSupprimer.addEventListener('click', () => supprimerEntite(entite));
      tdActions.appendChild(boutonSupprimer);

      ligne.appendChild(tdActions);
      corpsTableau.appendChild(ligne);
    });
  }

  function ouvrirFormulaire(entite) {
    erreurFormulaire.hidden = true;
    if (entite) {
      idEnEdition = entite.id;
      titreFormulaire.textContent = 'Modifier l’entité';
      champType.value = entite.type;
      champNom.value = entite.nomReel;
      champEmail.value = entite.email || '';
    } else {
      idEnEdition = null;
      titreFormulaire.textContent = 'Ajouter une entité';
      formulaire.reset();
      champType.value = 'PER';
    }
    dialogue.showModal();
    champNom.focus();
  }

  function fermerFormulaire() {
    dialogue.close();
    formulaire.reset();
    idEnEdition = null;
  }

  // Relit l'annuaire au moment même de l'écriture (plutôt que de réutiliser
  // la copie locale, potentiellement périmée) : un content script actif
  // dans un onglet peut avoir attribué un nouvel alias entre le chargement
  // de cette page et la validation du formulaire (rotation paresseuse,
  // M-08). Écraser tel quel effacerait cette mise à jour concurrente.
  async function mettreAJourAnnuaire(mutateur) {
    const donnees = await chrome.storage.local.get(['fogbank.annuaire']);
    const actuel = donnees['fogbank.annuaire'] || [];
    mutateur(actuel);
    await chrome.storage.local.set({ 'fogbank.annuaire': actuel });
  }

  async function enregistrerFormulaire(e) {
    e.preventDefault();
    const type = champType.value;
    const nomReel = champNom.value.trim();
    const email = champEmail.value.trim() || null;

    if (!nomReel) {
      erreurFormulaire.textContent = 'Le nom réel est obligatoire.';
      erreurFormulaire.hidden = false;
      return;
    }

    const idCible = idEnEdition;
    await mettreAJourAnnuaire((actuel) => {
      if (idCible) {
        const entite = actuel.find((e) => e.id === idCible);
        if (entite) {
          entite.type = type;
          entite.nomReel = nomReel;
          entite.email = email;
        }
      } else {
        actuel.push({
          id: genererIdEntite(),
          type,
          nomReel,
          email,
          creeLe: new Date().toISOString().slice(0, 10),
          aliasParSite: [],
        });
      }
    });

    fermerFormulaire();
  }

  async function supprimerEntite(entite) {
    const confirmation = confirm(
      `Supprimer « ${entite.nomReel} » ? Les tags déjà envoyés référençant ses alias ne pourront plus être résolus.`
    );
    if (!confirmation) return;
    await mettreAJourAnnuaire((actuel) => {
      const index = actuel.findIndex((e) => e.id === entite.id);
      if (index !== -1) actuel.splice(index, 1);
    });
  }

  champFiltre.addEventListener('input', () => {
    filtreActif = champFiltre.value;
    rendreTableau();
  });

  boutonAjouter.addEventListener('click', () => ouvrirFormulaire(null));
  boutonAnnuler.addEventListener('click', fermerFormulaire);
  formulaire.addEventListener('submit', enregistrerFormulaire);

  // Le clic sur le <dialog> lui-même (hors boîte) ferme, comme une
  // fermeture au clic extérieur classique — <dialog> ne le fait pas nativement.
  dialogue.addEventListener('click', (e) => {
    if (e.target === dialogue) fermerFormulaire();
  });

  // --- Onglet Sites -------------------------------------------------------
  const corpsTableauSites = document.getElementById('corps-tableau-sites');
  const etatVideSites = document.getElementById('etat-vide-sites');
  const boutonAjouterSite = document.getElementById('bouton-ajouter-site');
  const dialogueSite = document.getElementById('dialogue-formulaire-site');
  const formulaireSite = document.getElementById('formulaire-site');
  const titreFormulaireSite = document.getElementById('titre-formulaire-site');
  const siteChampDomaine = document.getElementById('site-champ-domaine');
  const siteChampActif = document.getElementById('site-champ-actif');
  const siteChampPreActive = document.getElementById('site-champ-pre-active');
  const siteChampDuree = document.getElementById('site-champ-duree');
  const siteChampFormat = document.getElementById('site-champ-format');
  const siteChampReplication = document.getElementById('site-champ-replication');
  const erreurFormulaireSite = document.getElementById('erreur-formulaire-site');
  const siteBoutonAnnuler = document.getElementById('site-bouton-annuler');

  function genererIdSite(domaine) {
    const base = `site-${domaine.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')}`;
    if (!sites.some((s) => s.id === base)) return base;
    let suffixe = 2;
    while (sites.some((s) => s.id === `${base}-${suffixe}`)) suffixe += 1;
    return `${base}-${suffixe}`;
  }

  function cocheOuTiret(valeur) {
    return valeur ? '✓' : '—';
  }

  function rendreTableauSites() {
    corpsTableauSites.textContent = '';
    const listeSites = [...sites].sort((a, b) => a.domaine.localeCompare(b.domaine, 'fr'));
    etatVideSites.hidden = listeSites.length > 0;

    listeSites.forEach((site) => {
      const ligne = document.createElement('tr');

      const tdDomaine = document.createElement('td');
      tdDomaine.textContent = site.domaine;
      ligne.appendChild(tdDomaine);

      const tdActif = document.createElement('td');
      tdActif.textContent = cocheOuTiret(site.actif);
      ligne.appendChild(tdActif);

      const tdPreActive = document.createElement('td');
      tdPreActive.textContent = cocheOuTiret(site.preActive);
      ligne.appendChild(tdPreActive);

      const tdDuree = document.createElement('td');
      tdDuree.textContent = LIBELLES_DUREE[site.dureeViePseudonyme] || site.dureeViePseudonyme;
      ligne.appendChild(tdDuree);

      const tdFormat = document.createElement('td');
      tdFormat.textContent = LIBELLES_FORMAT[site.formatPseudonyme] || site.formatPseudonyme;
      ligne.appendChild(tdFormat);

      const tdReplication = document.createElement('td');
      tdReplication.textContent = site.modeReplication === 'auto' ? 'Auto' : 'Manuel';
      ligne.appendChild(tdReplication);

      const tdCiblage = document.createElement('td');
      tdCiblage.textContent = site.cibleEcriture ? (site.cibleEcriture.tag || 'ciblé') : '—';
      ligne.appendChild(tdCiblage);

      const tdConfigure = document.createElement('td');
      tdConfigure.textContent = cocheOuTiret(site.configurationTerminee);
      ligne.appendChild(tdConfigure);

      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const boutonEditer = document.createElement('button');
      boutonEditer.type = 'button';
      boutonEditer.className = 'bouton-icone';
      boutonEditer.textContent = 'Modifier';
      boutonEditer.addEventListener('click', () => ouvrirFormulaireSite(site));
      tdActions.appendChild(boutonEditer);

      const boutonReinitialiser = document.createElement('button');
      boutonReinitialiser.type = 'button';
      boutonReinitialiser.className = 'bouton-icone';
      boutonReinitialiser.textContent = 'Retirer les réglages';
      boutonReinitialiser.addEventListener('click', () => reinitialiserConfiguration(site));
      tdActions.appendChild(boutonReinitialiser);

      const boutonSupprimer = document.createElement('button');
      boutonSupprimer.type = 'button';
      boutonSupprimer.className = 'bouton-icone danger';
      boutonSupprimer.textContent = 'Supprimer';
      boutonSupprimer.addEventListener('click', () => supprimerSite(site));
      tdActions.appendChild(boutonSupprimer);

      ligne.appendChild(tdActions);
      corpsTableauSites.appendChild(ligne);
    });
  }

  function ouvrirFormulaireSite(site) {
    erreurFormulaireSite.hidden = true;
    if (site) {
      idSiteEnEdition = site.id;
      titreFormulaireSite.textContent = 'Modifier le site';
      siteChampDomaine.value = site.domaine;
      siteChampActif.checked = site.actif;
      siteChampPreActive.checked = site.preActive;
      siteChampDuree.value = site.dureeViePseudonyme;
      siteChampFormat.value = site.formatPseudonyme;
      siteChampReplication.value = site.modeReplication || 'manuel';
    } else {
      idSiteEnEdition = null;
      titreFormulaireSite.textContent = 'Ajouter un site';
      formulaireSite.reset();
      siteChampActif.checked = true;
      siteChampPreActive.checked = false;
      siteChampDuree.value = '1a';
      siteChampFormat.value = 'court';
      siteChampReplication.value = 'manuel';
    }
    dialogueSite.showModal();
    siteChampDomaine.focus();
  }

  function fermerFormulaireSite() {
    dialogueSite.close();
    formulaireSite.reset();
    idSiteEnEdition = null;
  }

  async function mettreAJourSites(mutateur) {
    const donnees = await chrome.storage.local.get(['fogbank.sites']);
    const actuel = donnees['fogbank.sites'] || [];
    mutateur(actuel);
    await chrome.storage.local.set({ 'fogbank.sites': actuel });
  }

  async function enregistrerFormulaireSite(e) {
    e.preventDefault();
    const domaine = siteChampDomaine.value.trim();
    const actif = siteChampActif.checked;
    const preActive = siteChampPreActive.checked;
    const dureeViePseudonyme = siteChampDuree.value;
    const formatPseudonyme = siteChampFormat.value;
    const modeReplication = siteChampReplication.value;

    if (!domaine) {
      erreurFormulaireSite.textContent = 'Le domaine est obligatoire.';
      erreurFormulaireSite.hidden = false;
      return;
    }

    const idCible = idSiteEnEdition;
    let nouveauSite = null;
    await mettreAJourSites((actuel) => {
      if (idCible) {
        const site = actuel.find((s) => s.id === idCible);
        if (site) {
          site.domaine = domaine;
          site.actif = actif;
          site.preActive = preActive;
          site.dureeViePseudonyme = dureeViePseudonyme;
          site.formatPseudonyme = formatPseudonyme;
          site.modeReplication = modeReplication;
        }
      } else {
        nouveauSite = {
          id: genererIdSite(domaine),
          domaine,
          actif,
          preActive,
          creeLe: new Date().toISOString().slice(0, 10),
          dureeViePseudonyme,
          formatPseudonyme,
          modeReplication,
          cibleEcriture: null,
          // Un site ajouté ici n'a pas encore été ciblé ni testé (UC-005) :
          // le parcours de configuration s'affichera dans le panneau dès
          // que ce domaine sera visité.
          configurationTerminee: false,
        };
        actuel.push(nouveauSite);
      }
    });

    // Alias par défaut « Paris, France » (voir UC-005, Données) — après
    // coup, une fois `nouveauSite.creeLe` connu et le site déjà persisté.
    if (nouveauSite) {
      await mettreAJourAnnuaire((annuaireActuel) => {
        assurerAliasParisPourSite(annuaireActuel, nouveauSite);
      });
    }

    fermerFormulaireSite();
  }

  // « Retirer les réglages » (voir UC-005) : relance le parcours de
  // configuration sans supprimer le site ni son historique d'alias dans
  // l'annuaire — contrairement à la suppression complète ci-dessous.
  async function reinitialiserConfiguration(site) {
    const confirmation = confirm(
      `Réinitialiser la configuration de « ${site.domaine} » ? Le ciblage devra être refait (clic droit → écrire ici), et le parcours de configuration se réaffichera dans le panneau.`
    );
    if (!confirmation) return;
    await mettreAJourSites((actuel) => {
      const cible = actuel.find((s) => s.id === site.id);
      if (cible) {
        cible.cibleEcriture = null;
        cible.configurationTerminee = false;
      }
    });
  }

  // Suppression complète (voir UC-005) : contrairement à un simple retrait
  // des réglages, purge aussi dans l'annuaire tout aliasParSite référençant
  // ce site (avec son historique) — sinon ces entrées restent orphelines,
  // affichées par leur seul identifiant technique (voir nomSite ci-dessus).
  async function supprimerSite(site) {
    const confirmation = confirm(
      `Supprimer complètement « ${site.domaine} » ? Cette action retire aussi son historique d'alias de toutes les entités de l'annuaire — irréversible.`
    );
    if (!confirmation) return;
    await mettreAJourSites((actuel) => {
      const index = actuel.findIndex((s) => s.id === site.id);
      if (index !== -1) actuel.splice(index, 1);
    });
    await mettreAJourAnnuaire((actuelAnnuaire) => {
      actuelAnnuaire.forEach((entite) => {
        entite.aliasParSite = entite.aliasParSite.filter((aps) => aps.siteId !== site.id);
      });
    });
  }

  boutonAjouterSite.addEventListener('click', () => ouvrirFormulaireSite(null));
  siteBoutonAnnuler.addEventListener('click', fermerFormulaireSite);
  formulaireSite.addEventListener('submit', enregistrerFormulaireSite);

  dialogueSite.addEventListener('click', (e) => {
    if (e.target === dialogueSite) fermerFormulaireSite();
  });

  // --- Chargement partagé -------------------------------------------------
  async function chargerEtRendre() {
    const donnees = await chrome.storage.local.get(['fogbank.annuaire', 'fogbank.sites']);
    annuaire = donnees['fogbank.annuaire'] || [];
    sites = donnees['fogbank.sites'] || [];
    rendreTableau();
    rendreTableauSites();
  }

  chrome.storage.onChanged.addListener((changements, zone) => {
    if (zone !== 'local') return;
    if (changements['fogbank.annuaire'] || changements['fogbank.sites']) {
      chargerEtRendre();
    }
  });

  chargerEtRendre();
})();
