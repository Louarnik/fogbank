# Fixture de test — site IA factice

`index.html` simule un site IA générique pour développer et tester
l'extension **sans dépendre d'un vrai site** (ChatGPT, Claude...) ni
envoyer quoi que ce soit sur le réseau.

Deux scénarios sur la même page, car les sites réels utilisent l'un ou
l'autre pour leur champ de saisie :

- **Scénario A** — `<textarea>` classique
- **Scénario B** — `<div contenteditable>`

Pour chaque scénario :

- Un bouton **Envoyer** qui affiche, dans le panneau *"Payload envoyé au
  serveur"*, le contenu exact du champ au moment du clic. C'est ce qui
  permet de vérifier que l'extension a bien substitué les mentions par
  leur pseudonyme `[TYP:CODE]` **avant** ce clic (M-06) — si le panneau
  affiche encore le nom réel, la substitution n'a pas eu lieu à temps.
- **La réception est automatique** : ce même clic déclenche seul une
  réponse simulée en streaming qui reprend le contenu envoyé, entouré de
  deux blocs de texte de remplissage (Lorem ipsum) — pratique pour vérifier
  la restauration d'un tag `[TYP:CODE]` sans ressaisir de réponse à la main
  à chaque essai. Le texte révélé par petits blocs (3 caractères toutes les
  60 ms) exerce les deux phases de UC-002 :
  - pendant le streaming, la zone de réponse porte l'attribut
    `data-streaming="true"` ;
  - à la fin, cet attribut est retiré et un événement
    `fogbank:streaming-end` (avec `bubbles: true`) est déclenché sur la
    zone — c'est le signal qu'un adaptateur de site (`isStreaming` /
    `onStreamingEnd`, voir [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md))
    peut utiliser pour détecter la fin de génération.
- Un panneau replié **"🧪 Contrôles de test"** (harnais, ne fait pas partie
  du "site" simulé) reste disponible pour composer une réponse arbitraire
  (tag inconnu, tag cassé, texte sans rapport avec l'envoi...), avec les deux
  mêmes mécanismes d'injection :
  - **Simuler la réception de cette réponse** — injection instantanée,
    texte complet d'un coup.
  - **Simuler une réponse progressive (streaming)** — même mécanisme que la
    réception automatique, mais avec un texte choisi librement.

## Utilisation

1. Charger l'extension "unpacked" (`src/`) depuis `chrome://extensions` —
   `background.js` pré-charge automatiquement l'annuaire de test et la
   whitelist des trois fixtures locales au premier démarrage (voir
   [annuaire-exemple.README.md](../annuaire-exemple.README.md), section
   « Chargement automatique »). Pas d'étape manuelle supplémentaire.
2. Sur la carte de l'extension **fogbank**, cliquer sur **Détails** puis
   activer **Autoriser l'accès aux URL de fichiers** (nécessaire pour
   qu'un content script s'exécute sur une page `file://`).
3. Ouvrir `index.html` directement dans Chrome (double-clic, ou
   `file:///.../tests/fixtures/mock-ai-site/index.html`).

## Pourquoi cette fixture reste "bête"

Le JS de la page ne connaît rien de fogbank : il se contente de lire le
champ au clic et d'afficher des réponses simulées, exactement comme le
ferait n'importe quel vrai site aux yeux d'un content script. Ça permet de
tester l'extension dans des conditions représentatives, UC par UC, avant
de valider contre un vrai site.
