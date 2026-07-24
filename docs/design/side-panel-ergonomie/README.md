# Handoff : Side panel fogbank — ergonomie

## Overview
Panneau latéral (side panel) de l'extension fogbank : pseudonymise les données sensibles saisies dans un prompt et restaure la réponse. Ce document couvre la disposition et le comportement du panneau, de haut en bas.

## About the Design Files
Les fichiers de ce dossier sont des **références de design réalisées en HTML** (prototype visuel) — pas du code de production à copier tel quel. Le travail consiste à **recréer ce design dans l'environnement existant du projet fogbank** (l'extension Chrome MV3, son côté sidepanel HTML/JS/CSS déjà en place dans `src/sidepanel/`) en respectant ses conventions actuelles, pas à injecter ce fichier HTML directement.

## Fidelity
**Haute fidélité (hifi)** : couleurs, typographie, espacements et interactions sont définitifs, tirés du design system "Industry" (voir tokens plus bas). Le développeur doit recréer l'UI au pixel près.

## Screens / Views

### Panneau unique — largeur fixe 392px, hauteur 100vh
Colonne flex (`flex-direction: column`), du haut vers le bas :

**1. Titre**
- Icône (brouillard, style Lucide, `stroke-width:1.5`, couleur accent-700) + `<h1>` "fogbank", 20px, `font-family` heading, `letter-spacing:-0.01em`.
- Padding : `space-4` haut/côtés, `space-2` bas.

**2. Bandeau de site** (encadré "blueprint" — bordure fine + 4 marques d'angle `+`)
- Ligne 1 : nom de domaine (ex. "chatgpt.com", tronqué avec ellipsis) + tag statut (Actif = accent, Inactif = neutre) à gauche ; 2 boutons icône à droite (Configurer le site, Rafraîchir le ciblage).
- Ligne 2 (état normal, config terminée) : "Rotation : *1 an*" · "Alias : *court*" — 12px, 2 lignes max.
- Variante (config incomplète — seule exception à la limite de 2 lignes) : liste de 3 étapes (fait/en attente) + boutons "Continuer la configuration" / "Passer pour l'instant".

**3. Historique de la conversation, en clair** — **zone extensible** (flex:1, se redimensionne pour occuper tout l'espace restant de la fenêtre, quelle que soit sa taille)
- Titre "Historique — en clair" + bouton ghost "Lire maintenant" sur la même ligne.
- Cadre "blueprint" avec ascenseur interne (`overflow-y:auto`, `min-height:120px`) contenant une bulle par message :
  - Bordure gauche colorée 3px : accent-600 = "Vous", neutral-500 = "Assistant".
  - Tag rôle (10px) + 2 boutons icône par bulle : **Copier** (presse-papier) et **Localiser dans la page** (aller simple, scroll/surbrillance — jamais une navigation synchronisée).
  - Texte en monospace 12px ; les entités reconnues (ex. "Pierre Dupont", "Acme Corp") sont soulignées en accent-700 (`border-bottom` plein), avec le tag `[TYP:CODE]` en `title` (infobulle au survol) plutôt qu'affiché.

**Conversion fichier** (imbriqué dans le bloc Historique, sans padding latéral propre pour rester aligné avec les autres titres)
- Titre "Conversion fichier" + bouton ghost "Convertir un fichier…" (visible seulement en mode manuel) sur la même ligne.
- Texte "Conversion automatique au téléchargement (.md, .txt)" + toggle switch sur la même ligne.
- Si toggle actif : note "Chaque fichier téléchargé sur un site actif est converti automatiquement, sans confirmation."

**4. Composer, en clair**
- Titre "Composer" + toggle "Envoi automatique" sur la même ligne.
- Zone de saisie (`.input`), hauteur fixe ≈ 4 lignes de texte, ascenseur interne si dépassement (`overflow-y:auto`). Entités reconnues soulignées en accent (même grammaire que l'historique). Déclencheur `&` pour mentionner une entité.
- Bandeau "Synchronisation suspendue" (conditionnel, mode avertissement) si le champ du site a été modifié hors panneau, avec bouton "Reprendre".
- Barre d'action, sur une seule ligne, justifiée aux extrémités :
  - **Pastille compteur** (gauche), cliquable — déroule une liste "Nom réel → [TYP:CODE]" au-dessus d'elle :
    - N > 0 : teinte accent (accent-100 bg / accent-800 texte), icône œil-barré, libellé "N masqués" (pluriel accordé, sentence case).
    - N = 0 : teinte avertissement (ambre ~#8a4c1e sur fond ambre clair), icône triangle, libellé "0 masqué".
  - **Bouton "Envoyer"** (droite) : libellé fixe, jamais rallongé (pas de texte dynamique dans le bouton), style `.btn-primary` + cadre blueprint.

## Interactions & Behavior
- **Localiser dans la page** : action ponctuelle (scroll/surbrillance) sur la page du site cible — explicitement PAS une navigation synchronisée qui suivrait la conversation en continu.
- **Copier** : copie du texte de la bulle dans le presse-papier.
- **Toggles** (Envoi automatique, Conversion automatique) : switch on/off, piste accent quand actif / neutral-400 sinon, curseur qui se déplace de 2px à 18px.
- **Pastille compteur** : clic ouvre/ferme un menu déroulant listant les correspondances alias → nom réel.
- **Redimensionnement fenêtre** : seule la zone Historique grandit/rétrécit (flex:1) ; tout le reste garde une taille fixe. Historique et Composer ont chacun leur propre ascenseur interne si leur contenu dépasse ; un ascenseur global n'apparaît que si l'ensemble du panneau dépasse la fenêtre (comportement natif du navigateur, pas géré manuellement).
- **Bandeau de site** : passe en mode "configuration incomplète" (plus grand, jusqu'à 3 étapes) uniquement quand la config n'est pas terminée — seule exception à la règle des 2 lignes max.

## State Management
- `statutSite`: 'actif' | 'inactif'
- `modeReplication` / `envoiAutomatique`: booléen ou 'manuel' | 'auto'
- `etatSynchro`: 'synchronise' | 'attente' | 'echec' | 'suspendu'
- `entitesMasqueesCount`: number (≥0) — pilote la teinte/icône/libellé de la pastille
- `dureeViePseudonyme`: '1s' | '1t' | '1a' | 'infini'
- `formatPseudonyme`: 'court' | 'etendu' | 'opaque'
- `conversionFichierMode`: 'manuel' | 'auto'
- `configurationTerminee`: booléen

## Design Tokens (design system "Industry")
- `--color-bg`: #f2f2f3 · `--color-surface`: #e9e9ea · `--color-text`: #1d1f20
- `--color-accent`: #5980a6 (ramp 100→900, ex. accent-700 #416180, accent-800 #2c455d, accent-900 #1d2d3d)
- `--color-neutral` ramp 100→900 (500 #98989b … 900 #2b2b2d)
- Avertissement (hors ramp système, couleur locale) : ~#c17a2e / texte #8a4c1e
- Police : Barlow Condensed (titres, `--font-heading`), Barlow (corps, `--font-body`)
- Espacement/rayon : `--space-*`, `--radius-md` (densité 0.85×, rayon 4px)
- Cadre "blueprint" : bordure fine + 4 `<i class="corner tl/tr/bl/br">` — jamais de coins arrondis ni de fond plein (sauf bouton primaire).

## Assets
Aucune image — uniquement des icônes Lucide inline (stroke-width 1.5) et le fichier de tokens `assets/industry.css` (design system Industry, copié depuis le projet de référence).

## Files
- `Side Panel - Proposition.dc.html` — le prototype complet (markup + logique de tweaks). Référence `_ds/industry-…/styles.css` et `_ds_bundle.js` (inclus dans ce zip) — tokens et classes du design system Industry, à utiliser comme référence de valeurs (couleurs, typo, espacement) — pas à charger tel quel dans l'extension si celle-ci a déjà sa propre feuille de style (`src/sidepanel/sidepanel.css`).
- Code existant de référence pour l'intégration réelle : `src/sidepanel/sidepanel.html` / `.css` / `.js` dans le dossier du projet fogbank (dossier local attaché, pas inclus dans ce zip).
