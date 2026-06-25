import { verifyToken } from "@clerk/backend";

// Relais serveur pour la lecture du stock Shopify (lecture seule).
// Le token Admin Shopify reste cote serveur : il n'est jamais envoye au navigateur.
// MITMIT lit l'inventaire (par SKU) et s'en sert pour ses onglets internes
// (Stock, Reassort, alertes du tableau de bord). Aucune ecriture vers Shopify.
//
// Variables d'environnement attendues (cote Vercel / .env.local) :
//   SHOPIFY_STORE_DOMAIN  ex. « ma-boutique.myshopify.com »
//   SHOPIFY_ADMIN_TOKEN   jeton d'acces Admin API d'une app personnalisee
//                         (scopes read_products, read_inventory suffisent)
// Si CLERK_SECRET_KEY est presente, l'appel exige un jeton Clerk valide.

const API_VERSION = "2025-01";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode non autorisee" });
    return;
  }

  // Corps de requete (parse une seule fois) : action + identifiants eventuels saisis dans l'app.
  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {}
  const action = body.action ? String(body.action) : "sync";

  // Identifiants : ceux fournis par l'application (onglet Integrations) priment ; a defaut,
  // repli sur les variables d'environnement Vercel. Le jeton n'est jamais journalise.
  const rawDomain = (body.domain && String(body.domain).trim()) || process.env.SHOPIFY_STORE_DOMAIN;
  const adminToken = (body.token && String(body.token).trim()) || process.env.SHOPIFY_ADMIN_TOKEN;
  if (!rawDomain || !adminToken) {
    res.status(503).json({
      error:
        "Shopify non configure : renseignez le domaine de la boutique et le jeton Admin (onglet Integrations), ou definissez SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN cote serveur (scopes read_products + read_inventory).",
    });
    return;
  }

  // Authentification Clerk (meme logique que /api/claude et /api/gmail).
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (clerkSecret) {
    const authHeader = req.headers.authorization || "";
    const clerkTok = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!clerkTok) {
      res.status(401).json({ error: "Non authentifie." });
      return;
    }
    try {
      await verifyToken(clerkTok, { secretKey: clerkSecret });
    } catch (e) {
      res.status(401).json({ error: "Session invalide ou expiree." });
      return;
    }
  }

  // Normalisation du domaine : on enleve un eventuel protocole et tout chemin.
  const shop = rawDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  const endpoint = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;

  // Appel GraphQL avec gestion simple du throttling (code THROTTLED de Shopify).
  const gql = async (query, variables) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminToken,
        },
        body: JSON.stringify({ query, variables: variables || {} }),
      });
      const txt = await r.text();
      let json = null;
      try {
        json = JSON.parse(txt);
      } catch (e) {}

      const throttled =
        json &&
        Array.isArray(json.errors) &&
        json.errors.some(
          (er) => er && er.extensions && er.extensions.code === "THROTTLED"
        );
      if ((r.status === 429 || throttled) && attempt < 3) {
        // On respecte le rythme de restauration du seau (cost.throttleStatus) si dispo.
        let wait = 1500;
        try {
          const ts =
            json && json.extensions && json.extensions.cost
              ? json.extensions.cost.throttleStatus
              : null;
          if (ts && ts.restoreRate) {
            const need = (json.extensions.cost.requestedQueryCost || 100) - (ts.currentlyAvailable || 0);
            if (need > 0) wait = Math.min(8000, Math.ceil((need / ts.restoreRate) * 1000) + 250);
          }
        } catch (e) {}
        await sleep(wait);
        continue;
      }
      return { status: r.status, json, txt };
    }
    return { status: 429, json: null, txt: "Shopify throttling persistant." };
  };

  try {
    // Test de connexion : requete minimale, utile pour le bouton « Tester ».
    if (action === "test") {
      const { status, json, txt } = await gql(
        `{ shop { name myshopifyDomain currencyCode } }`
      );
      if (status === 401 || status === 403) {
        res.status(403).json({
          error:
            "Acces Shopify refuse. Verifiez le token Admin et ses scopes (read_products, read_inventory).",
        });
        return;
      }
      if (status !== 200 || !json || json.errors) {
        res.status(502).json({
          error:
            "Erreur Shopify : " +
            (json && json.errors ? JSON.stringify(json.errors) : (txt || "").slice(0, 200)),
        });
        return;
      }
      res.status(200).json({ ok: true, shop: json.data.shop });
      return;
    }

    // Synchronisation : on parcourt toutes les variantes (SKU + quantite dispo).
    // inventoryQuantity = quantite vendable totale (toutes localisations confondues).
    const query = `query($cursor: String) {
      productVariants(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          sku
          inventoryQuantity
          price
          displayName
          product { title status }
        }
      }
    }`;

    const variants = [];
    let cursor = null;
    let pages = 0;
    const MAX_PAGES = 80; // garde-fou (~8000 variantes)
    while (pages < MAX_PAGES) {
      const { status, json, txt } = await gql(query, { cursor });
      if (status === 401 || status === 403) {
        res.status(403).json({
          error:
            "Acces Shopify refuse. Verifiez le token Admin et ses scopes (read_products, read_inventory).",
        });
        return;
      }
      if (status !== 200 || !json || json.errors) {
        res.status(502).json({
          error:
            "Erreur Shopify : " +
            (json && json.errors ? JSON.stringify(json.errors) : (txt || "").slice(0, 200)),
        });
        return;
      }
      const conn = json.data.productVariants;
      for (const n of conn.nodes || []) {
        if (!n.sku) continue;
        variants.push({
          sku: n.sku,
          dispo: typeof n.inventoryQuantity === "number" ? n.inventoryQuantity : null,
          prix: n.price != null && n.price !== "" ? Number(n.price) : null,
          titre: n.displayName || (n.product && n.product.title) || "",
          statut: n.product ? n.product.status : null,
        });
      }
      pages++;
      if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
      cursor = conn.pageInfo.endCursor;
    }

    res.status(200).json({ ok: true, shop, count: variants.length, variants });
  } catch (e) {
    res.status(502).json({
      error: "Synchro Shopify indisponible : " + (e && e.message ? e.message : String(e)),
    });
  }
}
