# Tests

Le développement se fait UC par UC (voir [docs/SPECS.md](../docs/SPECS.md))
contre la fixture locale [fixtures/mock-ai-site/](fixtures/mock-ai-site/) —
un site IA factice qui ne fait aucun appel réseau, utilisé pour vérifier :

- ce que l'extension enverrait réellement (panneau "Payload envoyé"),
  pour valider la substitution des mentions par leur pseudonyme (M-06) ;
- la restauration automatique d'une réponse simulée contenant des
  pseudonymes (M-07).

Voir le [README de la fixture](fixtures/mock-ai-site/README.md) pour le
mode d'emploi détaillé.

## Jeu de données d'annuaire

[fixtures/annuaire-exemple.json](fixtures/annuaire-exemple.json) (et son
équivalent [fixtures/annuaire-exemple.xlsx](fixtures/annuaire-exemple.xlsx))
fournissent un annuaire fictif de 10 entités couvrant les 4 types, les 3
formats de pseudonyme, la rotation et la collision d'alias — voir
[fixtures/annuaire-exemple.README.md](fixtures/annuaire-exemple.README.md)
pour le détail et les hypothèses de modélisation. À utiliser pour
développer M-02, M-08, M-09, M-10 et M-13 sans données réelles.
