import { verifyToken } from "@clerk/backend";

// Relais serveur pour l'API Anthropic.
// La cle ANTHROPIC_API_KEY reste cote serveur : elle n'est jamais envoyee au navigateur.
// Si CLERK_SECRET_KEY est definie, l'appel exige un jeton Clerk valide (acces protege).
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode non autorisee" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY manquante cote serveur." });
    return;
  }

  // Protection par Clerk : active des que CLERK_SECRET_KEY est presente.
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (clerkSecret) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      res.status(401).json({ error: "Non authentifie." });
      return;
    }
    try {
      await verifyToken(token, { secretKey: clerkSecret });
    } catch (e) {
      res.status(401).json({ error: "Session invalide ou expiree." });
      return;
    }
  }

  try {
    const payload =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: payload,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    res
      .status(502)
      .json({ error: "Relais IA indisponible : " + (e && e.message ? e.message : String(e)) });
  }
}
