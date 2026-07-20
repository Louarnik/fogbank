# fogbank

Pseudonymise data in prompt and reverse it.

Extension Chrome (Manifest V3) qui pseudonymise les données sensibles dans un
prompt avant envoi, puis permet de restaurer (reverse) les valeurs
d'origine dans la réponse reçue.

> Statut : projet en démarrage. Les spécifications détaillées sont dans
> [docs/SPECS.md](docs/SPECS.md) et l'architecture cible dans
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (décisions détaillées dans
> [docs/adr/](docs/adr/)).

## Installation (développement)

1. Cloner le dépôt :
   ```bash
   git clone https://github.com/LouarnGlas/fogbank.git
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

```
fogbank/
├── src/                  # Code source de l'extension (chargé dans Chrome)
│   ├── manifest.json      # Déclaration Manifest V3
│   ├── popup/             # UI de la popup (action de la barre d'outils)
│   ├── background/        # Service worker
│   ├── content/           # Scripts injectés dans les sites autorisés
│   │   └── site-adapters/  # Un adaptateur DOM par site IA pris en charge
│   ├── options/           # Page de configuration (annuaire, sites, export/import Excel)
│   ├── vendor/            # Dépendances tierces vendored (ex: SheetJS, Apache-2.0)
│   └── icons/             # Icônes de l'extension
├── docs/                  # Documentation publique (specs, architecture, ADR)
│   └── adr/                # Décisions d'architecture (Architecture Decision Records)
├── tests/                 # Tests
└── private/               # Contenu confidentiel, non versionné (voir .gitignore)
```

Le dossier `private/` contient des données métier finance (cas réels,
benchmarks, notes) et n'est **jamais** poussé sur GitHub : il est listé dans
`.gitignore` et un hook `pre-commit` bloque tout commit qui y ferait
référence.

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
