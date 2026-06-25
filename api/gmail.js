import { verifyToken, createClerkClient } from "@clerk/backend";

// Relais serveur pour la synchronisation Gmail.
// L'utilisateur doit etre authentifie via Clerk ; on recupere son jeton OAuth
// Google (stocke par Clerk lors de la connexion « Se connecter avec Google »)
// et on interroge l'API Gmail cote serveur. Le jeton Google ne transite jamais
// par le navigateur.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode non autorisee" });
    return;
  }

  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    res.status(500).json({ error: "CLERK_SECRET_KEY manquante cote serveur." });
    return;
  }

  // Authentification Clerk obligatoire.
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Non authentifie." });
    return;
  }
  let userId = "";
  try {
    const payload = await verifyToken(token, { secretKey: clerkSecret });
    userId = payload.sub;
  } catch (e) {
    res.status(401).json({ error: "Session invalide ou expiree." });
    return;
  }

  // Adresse du contact a rechercher.
  let email = "";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    email = (body.email || "").trim();
  } catch (e) {}
  if (!email) {
    res.status(400).json({ error: "Adresse e-mail du contact manquante." });
    return;
  }

  // Recuperation du jeton OAuth Google de l'utilisateur via Clerk.
  let googleToken = "";
  try {
    const clerk = createClerkClient({ secretKey: clerkSecret });
    let resp;
    try {
      resp = await clerk.users.getUserOauthAccessToken(userId, "google");
    } catch (e1) {
      // Compatibilite : anciennes versions attendent le prefixe « oauth_ ».
      resp = await clerk.users.getUserOauthAccessToken(userId, "oauth_google");
    }
    const list = Array.isArray(resp) ? resp : (resp && resp.data) ? resp.data : [];
    googleToken = list[0] && list[0].token ? list[0].token : "";
  } catch (e) {
    res.status(502).json({ error: "Impossible de recuperer le jeton Google via Clerk : " + (e && e.message ? e.message : String(e)) });
    return;
  }
  if (!googleToken) {
    res.status(403).json({ error: "Aucun acces Google. Connectez-vous avec Google (autorisation Gmail) puis reessayez." });
    return;
  }

  const gAuth = { Authorization: "Bearer " + googleToken };
  try {
    // 1) Liste des messages echanges avec l'adresse (envoyes ou recus).
    const q = encodeURIComponent(`(from:${email} OR to:${email})`);
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=8&q=${q}`;
    const listRes = await fetch(listUrl, { headers: gAuth });
    if (listRes.status === 401 || listRes.status === 403) {
      res.status(403).json({ error: "Autorisation Gmail refusee. Reconnectez-vous avec Google pour accorder l'acces a Gmail (scope gmail.readonly)." });
      return;
    }
    if (!listRes.ok) {
      const t = await listRes.text();
      res.status(502).json({ error: "Erreur API Gmail (" + listRes.status + ") : " + t.slice(0, 200) });
      return;
    }
    const listData = await listRes.json();
    const ids = (listData.messages || []).map((m) => m.id);

    // 2) Metadonnees de chaque message (sujet, date, expediteur).
    const messages = [];
    for (const id of ids) {
      const mUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`;
      const mRes = await fetch(mUrl, { headers: gAuth });
      if (!mRes.ok) continue;
      const m = await mRes.json();
      const headers = (m.payload && m.payload.headers) || [];
      const h = (name) => { const x = headers.find((y) => (y.name || "").toLowerCase() === name); return x ? x.value : ""; };
      const subject = h("subject") || "(sans objet)";
      const from = h("from");
      const rawDate = h("date");
      let date = "";
      try { const d = new Date(rawDate); if (!isNaN(d)) date = d.toISOString().slice(0, 10); } catch (e) {}
      // entrant = le contact nous a ecrit ; sortant = nous lui avons ecrit.
      const direction = from.toLowerCase().includes(email.toLowerCase()) ? "entrant" : "sortant";
      messages.push({ date, sujet: subject, direction, resume: m.snippet || "" });
    }

    res.status(200).json({ messages });
  } catch (e) {
    res.status(502).json({ error: "Synchro Gmail indisponible : " + (e && e.message ? e.message : String(e)) });
  }
}
