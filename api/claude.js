import { verifyToken } from "@clerk/backend";

// Laisse au relais jusqu'a 180 s d'execution cote Vercel. La recherche IA de prospects utilise la
// recherche web (plusieurs requetes vers des registres officiels) et depasse facilement les ~60 s :
// sans une duree assez longue, Vercel coupe la fonction avant la reponse d'Anthropic -> 502/504.
export const config = { maxDuration: 180 };

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

  // Protection par Clerk OBLIGATOIRE : on refuse si la cle n'est pas configuree
  // (evite tout relais ouvert non authentifie vers l'API payante Anthropic).
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    res.status(500).json({ error: "Authentification non configuree cote serveur." });
    return;
  }
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

  // Garde-fou anti-blocage : on abandonne l'appel amont juste avant la limite Vercel (renvoie un 502 controle).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 175000);
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
      signal: controller.signal,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "Relais IA : delai depasse." : "Relais IA indisponible : " + (e && e.message ? e.message : String(e));
    res.status(502).json({ error: msg });
  } finally {
    clearTimeout(timer);
  }
}
