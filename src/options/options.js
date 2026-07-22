// Page d'options — deux onglets, deux CRUD indépendants :
// - Annuaire (fogbank.annuaire, M-12). Les alias par site (aliasParSite)
//   restent en lecture seule ici : ils ne sont produits que par la rotation
//   paresseuse (M-08/M-10) au fil de l'usage dans un champ de saisie,
//   jamais saisis à la main.
// - Sites (fogbank.sites, M-01). Un site désactivé n'est jamais câblé par
//   le content script (voir content.js) ; la popup offre un raccourci pour
//   basculer actif/inactif sur l'onglet en cours sans passer par ici.
(function () {
  const LIBELLES_DUREE = { '1s': '1 semaine', '1t': '1 trimestre', '1a': '1 an', infini: 'Infinie' };
  const LIBELLES_FORMAT = { court: 'Court', etendu: 'Étendu', opaque: 'Opaque' };

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

      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const boutonEditer = document.createElement('button');
      boutonEditer.type = 'button';
      boutonEditer.className = 'bouton-icone';
      boutonEditer.textContent = 'Modifier';
      boutonEditer.addEventListener('click', () => ouvrirFormulaireSite(site));
      tdActions.appendChild(boutonEditer);

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
    } else {
      idSiteEnEdition = null;
      titreFormulaireSite.textContent = 'Ajouter un site';
      formulaireSite.reset();
      siteChampActif.checked = true;
      siteChampPreActive.checked = false;
      siteChampDuree.value = '1a';
      siteChampFormat.value = 'court';
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

    if (!domaine) {
      erreurFormulaireSite.textContent = 'Le domaine est obligatoire.';
      erreurFormulaireSite.hidden = false;
      return;
    }

    const idCible = idSiteEnEdition;
    await mettreAJourSites((actuel) => {
      if (idCible) {
        const site = actuel.find((s) => s.id === idCible);
        if (site) {
          site.domaine = domaine;
          site.actif = actif;
          site.preActive = preActive;
          site.dureeViePseudonyme = dureeViePseudonyme;
          site.formatPseudonyme = formatPseudonyme;
        }
      } else {
        actuel.push({
          id: genererIdSite(domaine),
          domaine,
          actif,
          preActive,
          dureeViePseudonyme,
          formatPseudonyme,
        });
      }
    });

    fermerFormulaireSite();
  }

  async function supprimerSite(site) {
    const confirmation = confirm(
      `Supprimer « ${site.domaine} » ? fogbank n'agira plus sur ce site. Les alias déjà attribués sur ce site dans l'annuaire ne seront pas supprimés, mais n'afficheront plus que son identifiant technique.`
    );
    if (!confirmation) return;
    await mettreAJourSites((actuel) => {
      const index = actuel.findIndex((s) => s.id === site.id);
      if (index !== -1) actuel.splice(index, 1);
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
