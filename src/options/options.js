// Page d'options — CRUD sur l'annuaire (fogbank.annuaire, M-12). Les alias
// par site (aliasParSite) restent en lecture seule ici : ils ne sont
// produits que par la rotation paresseuse (M-08/M-10) au fil de l'usage
// dans un champ de saisie, jamais saisis à la main.
(function () {
  let annuaire = [];
  let sites = [];
  let filtreActif = '';
  let idEnEdition = null; // null = création, sinon id de l'entité éditée

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

  async function chargerEtRendre() {
    const donnees = await chrome.storage.local.get(['fogbank.annuaire', 'fogbank.sites']);
    annuaire = donnees['fogbank.annuaire'] || [];
    sites = donnees['fogbank.sites'] || [];
    rendreTableau();
  }

  chrome.storage.onChanged.addListener((changements, zone) => {
    if (zone !== 'local') return;
    if (changements['fogbank.annuaire'] || changements['fogbank.sites']) {
      chargerEtRendre();
    }
  });

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

  chargerEtRendre();
})();
