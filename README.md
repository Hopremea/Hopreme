# MITMIT, cockpit PEN'UP 3D

Application React (Vite) du cockpit commercial PEN'UP 3D, prête à déployer sur Vercel,
accès privé via Clerk, et fonctions IA branchées sur un relais serveur (clé Anthropic protégée).

## Ce que c'est, et ce que ce n'est pas (à lire avant de déployer)

Honnêteté sur l'architecture, pour éviter les mauvaises surprises :

1. Les données (comptes, contacts, devis, calculs) sont stockées dans le `localStorage`
   du navigateur. Chaque navigateur a donc ses propres données. Ce n'est pas une base
   partagée : deux personnes sur deux postes ne voient pas les mêmes données. Pour un vrai
   multi-utilisateur synchronisé, il faudra une base de données et une API (chantier à part).
2. Clerk protège l'accès à l'écran (qui peut ouvrir l'app). Le relais IA `/api/claude`
   est protégé séparément, côté serveur, par vérification du jeton Clerk (voir variables).
3. Le bundle JavaScript public contient les données de démonstration (Cultura, King Jouet, etc.)
   et la logique tarifaire. C'est pourquoi l'accès doit rester privé. Ne déployez pas en public.

## Prérequis

- Node.js 18 ou plus récent
- Un compte Vercel
- Une application Clerk (clés `pk_` et `sk_`)
- Une clé API Anthropic dédiée à ce projet

## 1. Installation locale

Décompressez ce dossier dans `C:\Users\matth\OneDrive\Dokumente\programs\MITMIT`, puis :

```bash
npm install
```

Créez un fichier `.env.local` à la racine (copie de `.env.example`) :

```
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
ANTHROPIC_API_KEY=sk-ant-xxx
```

Lancement en local :

- `npm run dev` : démarre l'interface. Note : les fonctions IA (`/api/claude`) ne tournent
  pas avec `vite dev` seul. Pour tester l'IA en local, utilisez le runtime Vercel :
  `npx vercel dev` (il sert l'interface et les fonctions `/api`).

Sans `VITE_CLERK_PUBLISHABLE_KEY`, l'app s'ouvre sans protection (pratique en dev rapide).
Avec la clé, l'accès devient privé (écran de connexion Clerk).

## 2. Configurer Clerk

1. Dashboard Clerk, créez une application.
2. Récupérez `Publishable key` (pk_) et `Secret key` (sk_) dans API Keys.
3. Activez les méthodes de connexion souhaitées (e-mail, Google, etc.).
4. Après le premier déploiement, ajoutez le domaine Vercel dans les domaines autorisés
   de Clerk (sinon la connexion sera refusée sur le domaine de production).

## 3. Clé Anthropic dédiée

Créez une clé API dédiée à ce SaaS (console Anthropic). Elle ne sera jamais exposée au
navigateur : elle vit uniquement dans la variable serveur `ANTHROPIC_API_KEY` du relais.

## 4. Déploiement sur Vercel (via le tableau de bord)

La voie fiable pour un projet avec build et fonctions serverless passe par un dépôt Git.

1. Poussez ce dossier sur un dépôt GitHub privé.
2. Sur Vercel, New Project, importez ce dépôt. Vercel détecte Vite automatiquement
   (build `vite build`, sortie `dist`). Ne changez rien.
3. Dans Settings, Environment Variables, ajoutez les trois variables, pour
   Production (et Preview si vous voulez tester les previews) :
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `ANTHROPIC_API_KEY`
4. Déployez. Récupérez l'URL de production.
5. Reportez ce domaine dans Clerk (domaines autorisés).
6. Recommandé en plus : Vercel, Settings, Deployment Protection, activez la protection
   par mot de passe ou l'authentification Vercel. Double verrou en attendant que Clerk
   soit pleinement réglé.

Le fichier `vercel.json` route déjà toutes les pages vers `index.html` (sauf `/api`),
ce qui évite les erreurs 404 au rafraîchissement.

## 5. Vérifications après déploiement

- Ouvrir l'URL : l'écran de connexion Clerk doit apparaître (accès privé actif).
- Se connecter : le cockpit s'affiche.
- Tester une fonction IA (recherche société, assistant) : elle doit répondre.
  Si erreur 401 sur `/api/claude` : la connexion Clerk n'est pas transmise ou le domaine
  n'est pas autorisé dans Clerk. Si erreur 500 : `ANTHROPIC_API_KEY` manquante côté Vercel.

## Variables d'environnement (récapitulatif)

| Variable | Côté | Rôle |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | navigateur | Affiche l'écran de connexion, protège l'accès |
| `CLERK_SECRET_KEY` | serveur | Vérifie le jeton sur `/api/claude`, `/api/gmail`, `/api/shopify` |
| `ANTHROPIC_API_KEY` | serveur | Clé du relais IA, jamais envoyée au navigateur |
| `SHOPIFY_STORE_DOMAIN` | serveur | Domaine de la boutique (ex. `ma-boutique.myshopify.com`) |
| `SHOPIFY_ADMIN_TOKEN` | serveur | Jeton Admin API Shopify, jamais envoyé au navigateur |

Si `CLERK_SECRET_KEY` n'est pas définie, le relais répond sans vérifier le jeton :
à n'utiliser qu'en local. En production, définissez-la pour protéger `/api/claude`.

## Synchronisation du stock Shopify (lecture seule)

L'onglet **Intégrations & paramètres** (et un bouton « Stock Shopify » dans l'onglet
**Stock entrepôt**) permet de **lire** le stock disponible de votre boutique Shopify et de
mettre à jour la colonne « Dispo » du catalogue MITMIT. Ce stock alimente ensuite tous les
onglets internes (Stock, Réassort, alertes et KPIs du tableau de bord). **Aucune donnée
n'est écrite dans Shopify** : l'intégration est strictement en lecture.

Mise en place :

1. Dans l'admin Shopify : **Paramètres → Apps et canaux de vente → Développer des apps →
   Créer une app**. Donnez-lui les scopes Admin API **`read_products`** et
   **`read_inventory`**, installez-la, puis copiez le **jeton d'accès Admin API** (`shpat_…`).
2. Sur Vercel (Settings → Environment Variables, Production) ajoutez :
   - `SHOPIFY_STORE_DOMAIN` = `ma-boutique.myshopify.com`
   - `SHOPIFY_ADMIN_TOKEN` = le jeton `shpat_…`
3. Redéployez. Dans MITMIT, onglet Intégrations, cliquez **Tester la connexion** puis
   **Synchroniser le stock**.

Le rapprochement se fait sur le **SKU Shopify = code article MITMIT**. Les variantes dont le
SKU ne correspond à aucun code du catalogue sont ignorées. La quantité retenue est
`inventoryQuantity` (stock vendable total, toutes localisations confondues). Le jeton reste
côté serveur (relais `/api/shopify`, protégé par Clerk) et n'est jamais exposé au navigateur.
Si les variables ne sont pas définies, la synchro est simplement désactivée et l'app continue
de fonctionner normalement.

## Limites connues et pistes (pour la suite avec Claude Code)

- Bundle de 1,9 Mo (xlsx + recharts). Optimisable par code splitting (`import()` dynamique).
- Données en `localStorage`, pas de synchronisation multi-poste. Migration possible vers
  une base (Postgres, Supabase) plus une API, pour un vrai multi-utilisateur.
- Sauvegardez régulièrement via l'export intégré tant que la base n'est pas centralisée.

## Bascule sur Claude Code

Claude Code est adapté à ce type de projet (itérations sur un dépôt réel).

```bash
npm install -g @anthropic-ai/claude-code
cd C:\Users\matth\OneDrive\Dokumente\programs\MITMIT
claude
```

Vérifiez la commande d'installation et les prérequis à jour sur la documentation officielle
(docs.claude.com, section Claude Code), car ils évoluent.

Idées de premières tâches à confier à Claude Code :
- Découper `src/App.jsx` (3200 lignes) en modules par onglet, pour la maintenabilité.
- Ajouter le code splitting pour réduire la taille du bundle.
- Préparer la migration `localStorage` vers une base, si le multi-utilisateur devient utile.
