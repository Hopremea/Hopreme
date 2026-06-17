# Règles du projet

## Règle d'or — Déploiement automatique en production

À **chaque** demande de modification dans ce projet, une fois le changement
réalisé et vérifié (build OK), je dois le **déployer en production sans qu'on me
le redemande** :

1. Committer la modification sur la branche de travail.
2. Pousser la branche.
3. Ouvrir la PR si elle n'existe pas, puis la **fusionner dans `main`** (squash).
4. Confirmer que Vercel redéploie la production.

Le déploiement live est **durablement autorisé** par l'utilisateur : ne pas
demander de confirmation avant de fusionner dans `main`.

Exception : ne pas déployer automatiquement si l'utilisateur demande
explicitement de ne pas le faire, ou s'il s'agit d'un travail clairement
incomplet / expérimental.
