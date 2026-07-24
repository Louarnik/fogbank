# ADR-010 — Concepts : un mot, un seul, partout

**Statut** : acceptée
**Date** : 2026-07-24

## Contexte

Le code, les specs et les échanges avec les utilisateurs ont accumulé des synonymes pour
désigner les mêmes trois notions (la personne réelle, son code, sa forme insérée dans le
texte), ainsi que des verbes flottants pour désigner la substitution et sa réciproque. Ce
flou nuit à la fois à la lisibilité du code et à la rigueur du discours produit face à des
utilisateurs qui vont légitimement questionner la conformité RGPD.

## Décision

Un mot, un seul, pour chaque concept — dans le code, les docs et l'argumentaire produit.

### Concepts

| Mot | Désigne |
|---|---|
| entité | la personne / org réelle dans l'annuaire |
| alias | le CODE généré (`PDT`) |
| tag | la forme insérée dans le texte (`[PER:PDT]`) |

### Code (anglais)

- `substitute()` à l'aller (entité → tag)
- `resolve()` au retour (tag → entité)

### Docs et argumentaire

- **« pseudonymiser »** : terme exact du RGPD, celui à utiliser systématiquement.
- **À bannir** :
  - « anonymiser » — juridiquement faux, le produit est réversible par conception.
  - « défogger » — le brouillard reste une image de marque, jamais un verbe.
- **Exception UI** : « masqué » / « clair » restent autorisés comme **adjectifs d'état**
  dans l'interface (ex. « vue masquée », « texte clair ») — seuls les verbes
  correspondants (« masquer », « démasquer ») sont bannis, au profit de
  « pseudonymiser » / `substitute()` / `resolve()`.

## Conséquences

- Toute occurrence existante de synonymes (ex. « identifiant », « masquer », « démasquer »,
  « anonymiser », « défogger ») dans le code, les commentaires, les specs et les messages
  utilisateur doit être remplacée par le vocabulaire ci-dessus au fil de l'eau.
- Les revues de code et de docs peuvent désormais s'appuyer sur ce tableau comme référence
  unique en cas de doute terminologique.

## Sources

- Décision produit du 2026-07-24, motivée par la nécessité de tenir un discours RGPD
  rigoureux face aux utilisateurs.
