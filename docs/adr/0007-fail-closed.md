# ADR-007 — Mode fail-closed : le tag est la source de vérité

**Statut** : acceptée
**Date** : 2026-07-22

## Contexte

UC-001 (implémenté) substitue les mentions marquées par leur tag `[TYP:CODE]` juste avant
l'envoi (M-06), en réécrivant le contenu du champ. Ce modèle « fail-open » repose sur deux
hypothèses fragiles, mises en évidence par le relevé factuel de ChatGPT, Claude.ai et
Copilot (voir [docs/recherche/](../recherche/)) :

- **ProseMirror (ChatGPT, Claude.ai)** : le composer maintient un modèle de document
  interne indépendant du DOM. Une réécriture DOM juste avant l'envoi (`textContent`,
  `innerHTML`) n'atteint pas ce modèle — c'est l'état ProseMirror, inchangé, qui part
  réellement sur le réseau. La substitution silencieuse peut donc échouer sans que rien
  ne le signale : le vrai nom part en clair.
- **Copilot** : `WebSocket.prototype.send` est synchrone, sans possibilité d'attente
  asynchrone dans le hook, ce qui rend une substitution de dernière seconde encore plus
  fragile côté transport.
- Plus généralement, Manifest V3 a supprimé `webRequest` bloquant ; `declarativeNetRequest`
  ne peut ni lire ni modifier un corps de requête. Intercepter et réécrire le prompt
  sortant nécessiterait un hook `fetch`/WebSocket en monde `MAIN`, par site, avec le risque
  qu'une évolution du site le contourne silencieusement.

Une substitution qui peut échouer sans le signaler est un point de défaillance unique et
invisible — exactement ce que fogbank doit empêcher.

## Options considérées

| Option | Problème |
|---|---|
| **Fail-open (actuel, UC-001/UC-002)** : le vrai nom reste affiché dans le champ, substitué par le tag juste avant l'envoi | Repose sur une réécriture DOM qui n'atteint pas le modèle interne de ProseMirror (ChatGPT, Claude.ai) ; échec silencieux possible — le vrai nom peut partir en clair sans avertissement |
| **Fail-open + hook réseau sortant** : garder l'affichage en clair, substituer via un hook `fetch`/WebSocket en monde `MAIN` plutôt que par réécriture DOM | Résout le problème ProseMirror, mais réintroduit tout ce que MV3 a supprimé : un hook par site, un schéma de payload à connaître et maintenir par site (voir §5 de chaque constat), fragile au moindre changement de forme du corps de requête |
| **Fail-closed (retenue)** : le tag `[TYP:CODE]` est ce que l'utilisateur tape et voit dans le champ ; le vrai nom n'est jamais écrit dans l'éditeur, seulement décoré à l'affichage (soulignement, infobulle, légende) | Écarte entièrement la réécriture sortante ; en contrepartie, le calque de décoration doit reproduire fidèlement la position du texte réel (mesure par miroir sur `<textarea>`, `Range` sur `contenteditable`) et un garde-fou doit bloquer l'envoi si un vrai nom reste tapé en clair |

## Décision

Adopter le mode **fail-closed** : `[TYP:CODE]` est la source de vérité dans l'éditeur, dès
l'insertion (M-04). Aucune réécriture du champ n'a lieu à l'envoi. L'affichage du vrai nom
est un calque de décoration en lecture seule (soulignement + infobulle + légende sous le
champ), rendu dans un shadow root fermé, qui ne dépose jamais le vrai nom dans le DOM du
site. Le détail technique (façade `EditorHandle`, mesure par miroir, cloisonnement,
garde-fou, restauration réseau) est dans [docs/recherche/reco.md](../recherche/reco.md)
(R-01 à R-63).

Périmètre retenu : ChatGPT, Claude.ai, **Copilot grand public**
(`copilot.microsoft.com`). Microsoft 365 Copilot reste hors périmètre pour l'instant —
produit distinct, corpus tenant interrogé en grande partie hors du prompt (voir
[constat-copilot.md](../recherche/constat-copilot.md), §0 et §6).

## Conséquences

- **M-04** (ajout à la volée) insère désormais le **tag** dans l'éditeur, plus le vrai nom.
- **M-05** (marquage visuel) devient « calque de décoration + infobulle + légende » : on
  souligne un tag et on révèle le vrai nom au survol — l'inverse du comportement actuel.
- **M-06** (pseudonymisation à l'envoi) est redéfini : détection des vrais noms restés en
  clair dans le champ + garde-fou qui bloque l'envoi tant qu'ils n'ont pas été convertis en
  tag. Plus aucune écriture dans l'éditeur au moment de l'envoi.
- **M-07** (restauration à la réception) est inchangé dans son objectif, mais son
  mécanisme se déplace : hook réseau entrant (`fetch`/SSE) sur ChatGPT et Claude.ai,
  réécriture du flux de réponse plutôt que du DOM rendu ; repli par `MutationObserver` sur
  Copilot, jugé acceptable ici car une restauration ratée en réception n'est pas une fuite
  (au pire un pseudonyme reste affiché tel quel), contrairement à l'envoi.
- **UC-001** et **UC-002** (implémentés) décrivent le modèle fail-open et doivent être
  refondus en conséquence — marqués « à refondre » dans [SPECS.md](../SPECS.md) en
  attendant leur réécriture (voir `docs/recherche/reco.md` §J pour l'ordre d'implémentation
  proposé).
- Le contrat des adaptateurs de site change de forme : perd `extractPrompt`/`injectPrompt`
  (plus de réécriture sortante), gagne `inputKind` (déclaré, jamais deviné à l'exécution)
  et `getComposer` (qualification du champ par son conteneur — nécessaire sur Claude.ai où
  plusieurs éditeurs ProseMirror coexistent).
- Nouvelle façade `EditorHandle` à introduire (deux implémentations : `TextareaHandle`,
  `ContentEditableHandle`) pour que le reste du code ne manipule jamais l'élément brut —
  détail dans [ARCHITECTURE.md](../ARCHITECTURE.md).
- Nouvelle couche d'affichage : une racine shadow DOM fermée, cloisonnée du site
  (protection contre les outils de rejeu de session type FullStory/Clarity/rrweb et contre
  d'autres extensions), sans identifiant ni ressource externe reconnaissable.
- [ADR-004](0004-portee-permissions.md) reste inchangé — le fail-closed ne modifie pas le
  modèle de permissions par site, seulement ce qui se passe une fois le site autorisé.
- `tests/fixtures/mock-ai-site/` doit continuer d'exposer les deux variantes de champ
  (`<textarea>` et `contenteditable`, déjà le cas — scénarios A/B) pour exercer les deux
  `EditorHandle` indépendamment des sites réels ; à revalider contre le nouveau contrat.

## Sources

- [docs/recherche/reco.md](../recherche/reco.md) — recommandations R-01 à R-63
- [docs/recherche/constat-chatgpt.md](../recherche/constat-chatgpt.md)
- [docs/recherche/constat-claude.md](../recherche/constat-claude.md)
- [docs/recherche/constat-copilot.md](../recherche/constat-copilot.md)
