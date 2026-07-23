# ADR-009 — Réplication manuel/auto, panneau maître, repli presse-papier

**Statut** : acceptée
**Date** : 2026-07-23

## Contexte

ADR-008 déplace la composition dans le side panel et réplique son contenu vers le champ
ciblé du site par écrasement total. Trois questions restaient ouvertes une fois ce
principe posé :

1. Faut-il répliquer à chaque frappe (ressenti « live ») ou seulement sur un geste
   explicite ?
2. Que se passe-t-il quand l'écrasement échoue (cible perdue, site qui rejette
   l'écriture) ?
3. Que se passe-t-il si l'utilisateur tape **directement dans le champ du site** pendant
   que la réplication automatique est active ?

Ces questions ne sont pas seulement techniques : une réplication automatique qui échoue
silencieusement recrée exactement le risque qu'ADR-007 a écarté (un contenu envoyé
diffère de ce que l'utilisateur croit avoir écrit) — sauf qu'ici la source de vérité est
le panneau, pas le champ du site.

## Décision

**Mode de réplication configurable par site**, stocké dans `fogbank.sites[].modeReplication`
(`"manuel"` par défaut, `"auto"` activable) — se loge naturellement aux côtés de
`dureeViePseudonyme` et `formatPseudonyme` déjà présents sur la même entrée. Un site qui
tolère mal l'écrasement répété reste en manuel ; les autres passent en auto sans
changement de modèle de données au-delà d'un champ.

Trois conditions pour que le mode auto soit sûr :

- **Anti-rebond, pas par frappe** : écriture ~300-400 ms après l'arrêt de la saisie dans
  le panneau. Garde le ressenti « automatique » sans déclencher un cycle de rendu du
  site à chaque caractère.
- **Témoin de synchro visible** dans le panneau : *synchronisé* / *en attente* /
  *échec*. C'est le vrai danger du mode auto — si la cible est perdue, l'utilisateur
  continue de taper en croyant que ça suit, puis envoie depuis le site un texte périmé.
  Le témoin transforme une panne silencieuse en panne visible.
- **Dégradation automatique** : après un ou deux échecs d'écriture consécutifs,
  bascule en manuel pour la session en cours et le signale. Pas d'acharnement à
  réessayer indéfiniment.

**Panneau maître** : si une modification du champ ciblé est détectée alors qu'elle ne
provient pas de la dernière écriture de fogbank (comparaison au contenu que fogbank a
lui-même écrit en dernier), la synchronisation automatique est **suspendue** avec un
message, plutôt que d'écraser silencieusement la saisie de l'utilisateur au prochain
cycle, ou de continuer à ignorer ce qui se passe réellement sur le site. C'était le
point non tranché explicitement soulevé pendant la conception ; option retenue par
simplicité — l'alternative (fusionner les deux sources) n'a pas de résolution évidente
et aurait réintroduit de la complexité que ce pivot cherche justement à éliminer.

**Repli presse-papier systématique** : un bouton « copier » est toujours disponible dans
le panneau, quel que soit le mode — c'est le filet de sécurité quand la cible est perdue
ou que l'écriture échoue. Contrairement à la réplication, il n'a pas de mode d'échec
propre : `navigator.clipboard.writeText` depuis une page d'extension ne dépend d'aucun
état du site cible.

**Fail-closed, transposé** : ADR-007 posait que le tag ne doit jamais être écrit en
clair sans que ce soit un geste explicite de l'utilisateur (menu `&`). Ici, l'équivalent
est que fogbank ne doit **jamais laisser croire** qu'un texte est parti alors qu'il ne
l'est pas — d'où le témoin de synchro et la suspension sur modification externe plutôt
qu'un échec silencieux. Il n'y a pas de blocage de l'envoi proprement dit : fogbank ne
contrôle pas le bouton d'envoi du site (voir Conséquences), seulement l'état affiché
dans le panneau au moment où l'utilisateur déciderait d'envoyer.

Spike complémentaire retenu : la rafale d'écrasements rapprochés (S1 étendu) a montré
que Claude.ai, ChatGPT et Copilot acceptent des écrasements successifs sur le même champ
— condition nécessaire pour que le mode auto (qui écrase à chaque anti-rebond, pas une
seule fois) soit viable.

## Conséquences

- `fogbank.sites[]` gagne `modeReplication: "manuel" | "auto"` (défaut `"manuel"`) —
  visible et modifiable dans l'onglet Sites de `options/`.
- Le panneau affiche un témoin de synchro à trois états et un bouton « copier »
  toujours actif, indépendamment du mode.
- fogbank **ne bloque pas** l'envoi côté site (pas de contrôle sur son bouton d'envoi) :
  la garantie porte sur l'exactitude du témoin affiché, pas sur une interdiction
  technique d'envoyer un contenu périmé. Limite assumée, à documenter pour
  l'utilisateur — symétrique à la limite déjà assumée par ADR-007 pour M-06 (pas de
  garde-fou sur un vrai nom tapé hors du menu `&`).
- `content/ecriture.js` (voir ADR-008) porte la détection de modification externe :
  compare le contenu du champ ciblé, à chaque `input`, à la dernière valeur écrite par
  fogbank, et notifie le panneau en cas d'écart.
- Aucun changement sur M-07 (restauration à la réception, affichage panneau — voir
  ADR-008 et UC-002 réécrit) : la réplication ne concerne que le sens panneau → site.

## Sources

- Discussion de conception du 2026-07-22/23 (deux notes : pivot side panel, puis
  raffinement réplication manuel/auto)
- [ADR-007](0007-fail-closed.md), [ADR-008](0008-side-panel.md)
