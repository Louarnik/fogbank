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
- Un panneau replié **"🧪 Contrôles de test"** (harnais, ne fait pas partie
  du "site" simulé) avec un champ pour taper une fausse réponse IA
  (éventuellement avec un tag `[PER:PDT]`) et deux boutons pour l'injecter
  dans la zone de réponse :
  - **Simuler la réception de cette réponse** — injection instantanée,
    texte complet d'un coup.
  - **Simuler une réponse progressive (streaming)** — révèle le texte par
    petits blocs (3 caractères toutes les 60 ms), pour tester les deux
    phases de UC-002 :
    - pendant le streaming, la zone de réponse porte l'attribut
      `data-streaming="true"` ;
    - à la fin, cet attribut est retiré et un événement
      `fogbank:streaming-end` (avec `bubbles: true`) est déclenché sur la
      zone — c'est le signal qu'un adaptateur de site (`isStreaming` /
      `onStreamingEnd`, voir [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md))
      peut utiliser pour détecter la fin de génération.

## Utilisation

1. Ouvrir `index.html` directement dans Chrome (double-clic, ou
   `file:///.../tests/fixtures/mock-ai-site/index.html`).
2. Dans `chrome://extensions`, sur la carte de l'extension **fogbank**,
   cliquer sur **Détails** puis activer **Autoriser l'accès aux URL de
   fichiers** (nécessaire pour qu'un content script s'exécute sur une page
   `file://`).
3. Une fois M-01 implémenté, ajouter cette page à la liste des sites
   autorisés (whitelist) pour que l'extension s'y active.

## Pourquoi cette fixture reste "bête"

Le JS de la page ne connaît rien de fogbank : il se contente de lire le
champ au clic et d'afficher des réponses simulées, exactement comme le
ferait n'importe quel vrai site aux yeux d'un content script. Ça permet de
tester l'extension dans des conditions représentatives, UC par UC, avant
de valider contre un vrai site.
