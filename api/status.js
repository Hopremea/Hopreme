import { verifyToken } from "@clerk/backend";
import { gmailIsConfigured, getConnectedEmail } from "../lib/gmail.js";

// Diagnostic des connexions / variables d'environnement (Clerk, Vercel, intégrations).
// NE renvoie JAMAIS de valeur secrète : uniquement le STATUT (définie / manquante) et l'état
// vivant de chaque intégration. Protégé par Clerk (si CLERK_SECRET_KEY est présente).
const isSet = (k) => Boolean(process.env[k] && String(process.env[k]).trim());

// Aperçu masqué non sensible pour les identifiants PUBLICS uniquement (ID client, domaines).
const mask = (k) => {
  const v = String(process.env[k] || "");
  if (!v) return "";
  if (v.length <= 10) return v.slice(0, 2) + "…";
  return v.slice(0, 6) + "…" + v.slice(-4);
};

export default async function handler(req, res) {
  // Authentification Clerk (active dès que CLERK_SECRET_KEY est présente).
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  let clerkUserId = null;
  if (clerkSecret) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) { res.status(401).json({ error: "Non authentifie." }); return; }
    try { const p = await verifyToken(token, { secretKey: clerkSecret }); clerkUserId = p.sub; }
    catch (e) { res.status(401).json({ error: "Session invalide ou expiree." }); return; }
  }

  // Liste des variables suivies. `optional` = la variable n'est pas indispensable au cœur de l'app.
  // `publicPreview` = aperçu masqué autorisé (identifiant public, non secret).
  const VARS = [
    { key: "ANTHROPIC_API_KEY", group: "IA (Claude)", label: "Clé API Anthropic", optional: false },
    { key: "CLERK_SECRET_KEY", group: "Clerk (authentification)", label: "Clé secrète Clerk", optional: false },
    { key: "VITE_CLERK_PUBLISHABLE_KEY", group: "Clerk (authentification)", label: "Clé publique Clerk", optional: false, publicPreview: true },
    { key: "VITE_SUPABASE_URL", group: "Supabase (synchro)", label: "URL Supabase", optional: false, publicPreview: true },
    { key: "VITE_SUPABASE_ANON_KEY", group: "Supabase (synchro)", label: "Clé anon Supabase", optional: false },
    { key: "SUPABASE_SERVICE_ROLE_KEY", group: "Supabase (synchro)", label: "Clé service (flux calendrier)", optional: true },
    { key: "SHOPIFY_STORE_DOMAIN", group: "Shopify (stock)", label: "Domaine boutique", optional: true, publicPreview: true },
    { key: "SHOPIFY_ADMIN_TOKEN", group: "Shopify (stock)", label: "Jeton Admin API", optional: true },
    { key: "GOOGLE_CLIENT_ID", group: "Gmail (envoi)", label: "Client ID Google", optional: true, publicPreview: true },
    { key: "GOOGLE_CLIENT_SECRET", group: "Gmail (envoi)", label: "Client Secret Google", optional: true },
    { key: "GOOGLE_USER_EMAIL", group: "Gmail (envoi)", label: "Adresse expéditrice", optional: true, publicPreview: true },
    { key: "GOOGLE_REFRESH_TOKEN", group: "Gmail (envoi)", label: "Refresh token", optional: true },
    { key: "GMAIL_FROM_NAME", group: "Gmail (envoi)", label: "Nom expéditeur", optional: true, publicPreview: true },
    { key: "NEXT_PUBLIC_APP_URL", group: "Gmail (envoi)", label: "URL app (surcharge)", optional: true, publicPreview: true },
  ];
  const vars = VARS.map((v) => ({
    key: v.key, group: v.group, label: v.label, optional: !!v.optional,
    set: isSet(v.key),
    preview: v.publicPreview && isSet(v.key) ? mask(v.key) : null,
  }));

  // État vivant de Gmail : connecté ? quelle adresse répond réellement ?
  let gmail = { configured: gmailIsConfigured(), email: null, error: null };
  if (gmail.configured) {
    try { gmail.email = await getConnectedEmail(); if (!gmail.email) gmail.error = "Le refresh token ne renvoie pas d'adresse (jeton invalide/expiré ?)."; }
    catch (e) { gmail.error = e && e.message ? e.message : String(e); }
  }

  res.status(200).json({
    at: new Date().toISOString(),
    clerk: { secretSet: isSet("CLERK_SECRET_KEY"), authenticated: !!clerkUserId, userId: clerkUserId },
    vars,
    gmail,
  });
}
