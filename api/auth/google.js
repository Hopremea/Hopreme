import { getAuthUrl, gmailHasOAuth } from "../../lib/gmail.js";

// Démarre le flow OAuth : redirige vers l'écran de consentement Google.
// Ouvre /api/auth/google dans le navigateur EN ÉTANT connecté au compte cible
// (ex. matthis-anael@penup3d.com).
export default async function handler(req, res) {
  if (!gmailHasOAuth()) {
    res.status(500).json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants dans l'environnement" });
    return;
  }
  try {
    res.writeHead(302, { Location: getAuthUrl() });
    res.end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
