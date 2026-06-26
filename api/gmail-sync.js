import { verifyToken } from "@clerk/backend";
import { gmailIsConfigured, searchMessagesForAddresses } from "../lib/gmail.js";

// Synchronisation des courriels : recherche dans la boîte Gmail connectée (GOOGLE_USER_EMAIL) tous
// les messages échangés (envoyés OU reçus) avec une liste d'adresses connues du site, et renvoie
// leurs métadonnées pour les journaliser dans le fil des échanges. Lecture seule. Protégé par Clerk.
export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Methode non autorisee" }); return; }

  // Authentification Clerk OBLIGATOIRE dès que la clé est présente (pas d'accès anonyme aux courriels).
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (clerkSecret) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) { res.status(401).json({ error: "Non authentifie." }); return; }
    try { await verifyToken(token, { secretKey: clerkSecret }); }
    catch (e) { res.status(401).json({ error: "Session invalide ou expiree." }); return; }
  }

  if (!gmailIsConfigured()) { res.status(503).json({ error: "Gmail non connecté côté serveur." }); return; }

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch (e) {}
  const addresses = Array.isArray(body.addresses) ? body.addresses.slice(0, 80) : [];
  if (!addresses.length) { res.status(200).json({ messages: [] }); return; }

  try {
    const messages = await searchMessagesForAddresses(addresses, { max: body.max || 150, newerThan: body.newerThan });
    res.status(200).json({ messages });
  } catch (e) {
    res.status(502).json({ error: "Synchro Gmail indisponible : " + (e && e.message ? e.message : String(e)) });
  }
}
