# Polices vendorées — Barlow / Barlow Condensed

Sous-ensemble latin (woff2) des polices utilisées par le design system
« Industry » (voir [docs/design/side-panel-ergonomie/](../../../docs/design/side-panel-ergonomie/)),
téléchargées depuis Google Fonts et vendorées ici pour respecter le principe
« tout local » (voir [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)) : aucun
appel réseau depuis le side panel.

- **Licence** : SIL Open Font License 1.1 (redistribution autorisée).
- **Source** : `https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;700&family=Barlow+Condensed:wght@400;600`
- **Fichiers** : uniquement le sous-ensemble `latin` (U+0000-00FF, couvre les
  caractères accentués français) — pas `latin-ext`/`vietnamese`, non
  nécessaires ici.

| Fichier | Famille | Graisse |
|---|---|---|
| `barlow-400.woff2` | Barlow | 400 |
| `barlow-500.woff2` | Barlow | 500 |
| `barlow-700.woff2` | Barlow | 700 |
| `barlow-condensed-400.woff2` | Barlow Condensed | 400 |
| `barlow-condensed-600.woff2` | Barlow Condensed | 600 |

Chargées via `@font-face` dans `src/sidepanel/sidepanel.css`.
