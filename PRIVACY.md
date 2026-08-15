# Politique de confidentialité — fogbank

Dernière mise à jour : 15 août 2026

## Résumé

fogbank ne collecte, ne transmet et ne vend aucune donnée personnelle. Tout
ce que l'extension traite reste stocké localement dans votre navigateur.

## Quelles données sont traitées

- **L'annuaire** : les entités que vous créez vous-même (nom réel, type,
  email facultatif) via le menu `&` du panneau ou la page d'options.
- **Les réglages de site** : la liste des sites sur lesquels vous avez
  activé fogbank, et vos préférences par site (mode d'envoi, champ ciblé).
- **Le journal de débogage** : historique des événements techniques du
  panneau (tests de ciblage/écriture, échecs), à but de diagnostic
  uniquement.

Aucune de ces données n'est associée à votre identité par fogbank — vous
choisissez vous-même quoi y saisir.

## Où ces données sont stockées

Exclusivement dans `chrome.storage.local`, une zone de stockage propre à
votre navigateur et à cette installation. Rien n'est synchronisé entre
appareils, rien n'est envoyé vers un serveur — fogbank n'a pas de serveur,
pas de backend, pas de compte utilisateur.

## Ce que fogbank envoie sur le réseau

Rien, sauf ce que vous envoyez vous-même en utilisant normalement le site
IA sur lequel vous avez activé fogbank (ChatGPT, Claude.ai, Copilot
grand public...) — fogbank réécrit le champ de composition de ce site
avant votre envoi, mais ne fait lui-même aucun appel réseau, ne contacte
aucun serveur tiers, n'installe aucun cookie ni traceur.

## Permissions demandées et pourquoi

- **storage, unlimitedStorage** : stocker localement votre annuaire et vos
  réglages.
- **tabs** : déterminer si l'onglet actif correspond à un site que vous
  avez activé.
- **contextMenus** : afficher l'option « fogbank : écrire ici » au clic
  droit dans un champ de saisie.
- **sidePanel** : ouvrir le panneau latéral, l'interface principale de
  l'extension.
- **Accès au contenu des pages** : techniquement large (toutes les pages),
  une contrainte de l'API d'extension Chrome actuellement utilisée — mais
  fogbank ne lit, ne modifie et ne substitue du texte que sur les sites
  que vous avez explicitement activés dans la liste blanche (page
  Options). Sur tout autre site, le script chargé reste inactif.

## Partage avec des tiers

Aucun. fogbank ne vend, ne loue ni ne partage vos données avec qui que ce
soit — il n'y a nulle part où les envoyer, tout reste sur votre machine.

## Vos choix

- Supprimer une entité, un site ou vider le journal : disponible
  directement dans la page Options.
- Exporter votre annuaire : bouton « Exporter » dans l'onglet Annuaire des
  options (fichier JSON téléchargé localement, jamais transmis).
- Désinstaller l'extension : `chrome://extensions` supprime aussi tout ce
  qui a été stocké localement.

## Code source

fogbank est un logiciel libre sous licence AGPL-3.0. Le code source
complet est public : https://github.com/Louarnik/fogbank — vous pouvez
vérifier vous-même chacune des affirmations ci-dessus.

## Contact

Une question, un signalement ?
https://github.com/Louarnik/fogbank/issues

## Modifications de cette politique

Toute modification de cette politique sera reflétée dans ce document ;
son historique complet est public sur GitHub.
