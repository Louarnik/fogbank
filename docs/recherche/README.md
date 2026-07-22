# Recherche — bascule fail-closed

Documents source d'[ADR-007](../adr/0007-fail-closed.md). Deux natures différentes,
à ne pas mélanger :

- [`constat-chatgpt.md`](constat-chatgpt.md), [`constat-claude.md`](constat-claude.md),
  [`constat-copilot.md`](constat-copilot.md) — **relevés factuels** par site (structure du
  DOM, sélecteurs, transport réseau, sondes de validation). Ce que chaque site *est*, pas
  ce que fogbank *doit faire*. Établis à partir de code open source public et de
  documentation (janvier–juillet 2026), **aucun sélecteur n'a été vérifié en direct** —
  rejouer la sonde de chaque constat avant implémentation et à chaque release.
- [`reco.md`](reco.md) — **recommandations d'implémentation** (`R-01`…`R-63`) qui en
  découlent : ce que fogbank doit faire. C'est ce document qui a motivé le passage au
  mode fail-closed (voir ADR-007) et la redéfinition de M-04/M-05/M-06 dans
  [SPECS.md](../SPECS.md).

À la prochaine session de travail : suivre l'ordre d'implémentation de `reco.md` §J pour
refondre UC-001 et UC-002 en conséquence (voir les notes de statut dans SPECS.md).
