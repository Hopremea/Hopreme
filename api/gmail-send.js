import { verifyToken } from "@clerk/backend";
import { sendEmail, gmailIsConfigured, getConnectedEmail } from "../lib/gmail.js";

// Envoi d'un e-mail via la boîte Gmail connectée (GOOGLE_USER_EMAIL), avec
// signature Gmail auto-injectée. Protégé par Clerk : l'utilisateur doit être
// authentifié dans MITMIT. Le jeton Google ne transite jamais par le navigateur.
//
// action "status" : indique si l'intégration est configurée et quelle adresse est connectée.
// action "send"   : envoie { to, subject, body, appendSignature? }.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode non autorisee" });
    return;
  }

  // Authentification Clerk (active si CLERK_SECRET_KEY est définie).
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (clerkSecret) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) { res.status(401).json({ error: "Non authentifie." }); return; }
    try { await verifyToken(token, { secretKey: clerkSecret }); }
    catch (e) { res.status(401).json({ error: "Session invalide ou expiree." }); return; }
  }

  let body = {};
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch (e) {}
  const action = body.action ? String(body.action) : "send";

  if (action === "status") {
    if (!gmailIsConfigured()) { res.status(200).json({ configured: false }); return; }
    const email = await getConnectedEmail();
    res.status(200).json({ configured: true, email });
    return;
  }

  if (!gmailIsConfigured()) {
    res.status(503).json({
      error: "Gmail non connecté côté serveur. Configurez l'intégration (GOOGLE_CLIENT_ID/SECRET, GOOGLE_USER_EMAIL, GOOGLE_REFRESH_TOKEN).",
    });
    return;
  }

  const to = (body.to || "").trim();
  const subject = (body.subject || "").trim();
  const text = body.body || "";
  if (!to || !subject) { res.status(400).json({ error: "Destinataire et objet requis." }); return; }

  try {
    const result = await sendEmail({ to, subject, body: text, appendSignature: body.appendSignature !== false });
    res.status(200).json({ ok: true, id: result.id || null, threadId: result.threadId || null });
  } catch (e) {
    res.status(502).json({ error: e && e.message ? e.message : String(e) });
  }
}
