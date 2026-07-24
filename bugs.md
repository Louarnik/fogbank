# TODO

Classée par priorité — à réévaluer à la reprise, ce n'est qu'une proposition.

## Haute — bugs/fiabilité qui touchent le cœur du produit

- [ ] La taille du tag doit être au moins égale à la taille du nom en clair,
      pour que la substitution se passe bien. *(fiabilité/données)*
- [ ] Revoir l'onboarding d'un site — actuellement trop buggué et trop long
      par rapport à l'objectif visé. *(ergonomie/UX)*
- [ ] Enregistrer le dictionnaire (annuaire) et vérifier qu'il reste à jour
      sur plusieurs sessions. *(fiabilité/données)*
- [ ] Bien caler tous les cas de rafraîchissement de page (refresh).
      *(ergonomie/UX)*
- [ ] Mieux enregistrer Copilot, OpenAI et ChatGPT comme sites par défaut.
      *(sites supportés)*
- [ ] Vérifier en vrai navigateur le nouveau contenteditable-handle (Ctrl+Z, IME, collage). *(fiabilité/données)*

## Moyenne — améliorations importantes mais non bloquantes

- [ ] Clarifier l'objectif d'ergonomie et les UC : le site doit porter les
      réglages de site ; la **lecture** est paramétrée/rafraîchie dans
      l'historique (en clair) ; l'**écriture** est paramétrée dans le
      composer. *(ergonomie/UX)*
- [ ] Chiffrer le dictionnaire (ex. SHA-XXX) pour garantir la
      confidentialité. *(sécurité)*
- [ ] Souligner en bleu, dans l'historique, les noms qui ont été substitués
      — mais exclure ce soulignement du copier-coller. *(ergonomie/UX)*
- [ ] Revoir le fallback en lecture pour générer une page statique sans JS,
      mais avec l'ensemble des éléments remplacés. *(fiabilité/données)*
- [ ] Reprendre les fixtures pour qu'elles soient plus représentatives des
      sites réels. *(sites supportés)*
- [ ] Gérer les homonymes dans l'annuaire (deux entités au même nom réel). *(fiabilité/données)*
- [ ] Passer à la permission `activeTab` + `contextMenus` plutôt que le whitelist de domaines large actuel. *(sécurité)*
- [ ] Ajouter les rôles ARIA (listbox/option) sur le menu `&` et une région `aria-live` sur l'infobulle de soulignement. *(accessibilité)*

## Basse — qualité, dette, exploration

- [ ] Simplifier le code. *(qualité)*
- [ ] Nettoyer le code et les UC. *(qualité)*
- [ ] Faire un audit de code. *(qualité)*
- [ ] Faire un REX du dev à partir des commits, pour aller plus vite la
      prochaine fois. *(process)*
- [ ] Ajouter un support pour Chatlit. *(sites supportés)*
- [ ] Ajouter des tests automatisés sur mention-menu.js/display.js/EditorHandle (aujourd'hui seul conversion-fichier.js est testé). *(qualité)*
