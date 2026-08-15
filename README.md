# fogbank

Pseudonymise data in prompt and reverse it.

Extension Chrome (Manifest V3) qui pseudonymise les données sensibles dans un
prompt avant envoi, puis permet de restaurer (reverse) les valeurs
d'origine dans la réponse reçue.

> Spécifications détaillées dans [docs/SPECS.md](docs/SPECS.md),
> architecture dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (décisions
> détaillées dans [docs/adr/](docs/adr/)), reste à faire dans
> [bugs.md](bugs.md).

## Installation (développement)

1. Cloner le dépôt :
   ```bash
   git clone https://github.com/Louarnik/fogbank.git
   cd fogbank
   ```
2. Installer les dépendances de développement (types Chrome pour l'IDE) :
   ```bash
   npm install
   ```
3. Charger l'extension dans Chrome :
   - Ouvrir `chrome://extensions`
   - Activer le **Mode développeur** (coin supérieur droit)
   - Cliquer sur **Charger l'extension non empaquetée**
   - Sélectionner le dossier `src/` de ce projet

## Structure du projet

Détail à jour dans [ARCHITECTURE.md](docs/ARCHITECTURE.md) (§ Composants de
l'extension) — en résumé : `src/sidepanel/` est la surface principale
(composition, lecture, réplication), `src/content/` et `src/shared/` le
code injecté/partagé, `src/options/` et `src/popup/` la configuration,
`docs/` la documentation publique (specs, architecture, ADR), `tests/` les
tests, `private/` le contenu confidentiel non versionné.

Le dossier `private/` contient des données métier finance (cas réels,
benchmarks, notes) et n'est **jamais** poussé sur GitHub : il est listé dans
`.gitignore` et un hook `pre-commit` bloque tout commit qui y ferait
référence.

## Confidentialité

Voir [PRIVACY.md](PRIVACY.md) — en résumé : aucune donnée ne quitte votre
navigateur, aucun serveur, aucun tracker.

## Licence

Ce projet est distribué sous licence **AGPL-3.0**. Voir le fichier
[LICENSE](LICENSE) pour le texte complet.

## Pour les contributeurs : réinstaller le hook pre-commit

Les hooks Git ne sont pas versionnés (dossier `.git/hooks/` ignoré par Git
par nature). Après un `git clone`, réinstalle le garde-fou anti-fuite de
données privées avec :

```bash
cp scripts/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Ce hook refuse tout commit qui inclurait un fichier situé sous `private/`.
