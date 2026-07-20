# ADR-001 — Caractère déclencheur du menu de sélection

**Statut** : acceptée
**Date** : 2026-07-20

## Contexte

Le mécanisme de pseudonymisation (voir [SPECS.md](../SPECS.md), M-03/M-04)
repose sur un caractère déclencheur : en le tapant dans un champ de saisie
d'un site autorisé, un menu s'ouvre pour sélectionner ou ajouter une
personne à pseudonymiser.

Le choix initial était `@`, par analogie avec les mentions façon
Notion/Slack. Mais `@` est déjà utilisé nativement par les principaux sites
IA ciblés par l'extension :

- **ChatGPT** : `@` ouvre un menu natif de mention des GPT personnalisés
  (custom GPTs) dans la zone de saisie.
- **ChatGPT** (autre fonctionnalité) : `/` ouvre un menu de commandes slash
  natif (`/status`, etc.).
- **Claude** : `@` est utilisé pour référencer des fichiers de projet /
  imports dans certains contextes (Claude Code, CLAUDE.md).

Réutiliser `@` ou `/` créerait un conflit direct avec ces menus natifs :
l'un des deux menus gagnerait la frappe selon l'ordre d'interception des
événements clavier, rendant le comportement imprévisible et fragile face à
des changements futurs des sites cibles.

## Options considérées

| Caractère | Problème |
|-----------|----------|
| `@`       | Déjà réservé par ChatGPT (mentions GPT) et Claude (référence fichiers) |
| `/`       | Déjà réservé par ChatGPT (commandes slash) |
| `#`       | Utilisé couramment par les utilisateurs pour la syntaxe Markdown (titres) dans un prompt — risque de faux déclenchements |
| `&`       | Aucun usage natif connu comme déclencheur sur ChatGPT ou Claude.ai ; peu utilisé en début/milieu de phrase dans un prompt classique |

## Décision

Utiliser `&` comme caractère déclencheur du menu de sélection.

## Conséquences

- Pas de conflit connu avec les menus natifs des sites cibles au moment de
  la rédaction (juillet 2026). À revérifier si un site ajoute un usage natif
  de `&`.
- Point de vigilance technique : `&` est aussi un caractère d'échappement
  HTML (`&amp;`, `&nbsp;`...). Si le champ cible est un élément
  `contenteditable` qui interprète du HTML, la détection doit se faire sur
  la frappe clavier brute (événement `keydown`/`input`), pas sur le HTML
  déjà rendu, pour éviter les faux négatifs/positifs.
- Ce choix est réversible : le caractère déclencheur devra être un paramètre
  configurable (pas codé en dur) pour permettre un changement rapide si un
  site cible se met un jour à réserver `&` à son tour.

## Sources

- [Use ChatGPT's Mention Feature "@" for Chats w/ Multiple GPT's!](https://runtheprompts.com/resources/chatgpt-info/gpt-mentions-feature/)
- [Custom ChatGPTs: Can They Interact via Mentions (@)? — OpenAI Developer Community](https://community.openai.com/t/custom-chatgpts-can-they-interact-via-mentions/1080447)
- [Slash commands — ChatGPT Learn](https://learn.chatgpt.com/docs/reference/slash-commands)
- [Referencing Files in Claude Code](https://stevekinney.com/courses/ai-development/referencing-files-in-claude-code)
