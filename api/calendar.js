// Flux iCalendar (.ics) en lecture seule, destiné à un ABONNEMENT dans Google Agenda
// (« Ajouter un agenda » → « À partir d'une URL »). Une fois dans Google Agenda, les
// événements apparaissent aussi dans Samsung Calendar via la synchronisation du compte Google.
//
// Sécurité : l'accès est protégé par un jeton secret stocké dans les données
// (settings.calendarToken, généré depuis l'application). L'état partagé est lu côté serveur
// avec la clé service Supabase (jamais exposée au navigateur), ce qui contourne la RLS.
//
// Variables d'environnement attendues (Vercel) :
//   SUPABASE_URL                (ou, à défaut, VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   (Project Settings → API → service_role ; reste côté serveur)

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPA_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

const EVENT_ICONS = { rdv: "🤝", relance: "🔔", salon: "🎪", preparation: "📋", tache: "✅", echeance: "⏰", livraison: "📦", autre: "•" };

const icsEscape = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/[;,]/g, (m) => "\\" + m).replace(/\r?\n/g, "\\n");
const icsFold = (line) => { if (line.length <= 73) return line; let out = "", r = line; while (r.length > 73) { out += r.slice(0, 73) + "\r\n "; r = r.slice(73); } return out + r; };
const icsDay = (ymd) => String(ymd || "").replace(/-/g, "");
const icsNextDay = (ymd) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, "0"); return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); };
const icsStamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return "" + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + "T" + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + "Z"; };
const fullName = (c) => [c && c.prenom, c && c.nom].filter(Boolean).join(" ").trim() || "Contact";

function buildCalendarICS(data) {
  const stamp = icsStamp();
  const accById = (id) => (data.accounts || []).find((a) => a.id === id);
  const raw = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PEN'UP 3D//MITMIT Cockpit//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:MITMIT — PEN'UP 3D", "X-WR-TIMEZONE:Europe/Paris", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"];
  (data.events || []).forEach((e) => {
    if (!e || !e.date) return;
    const a = e.accountId ? accById(e.accountId) : null;
    const icon = EVENT_ICONS[e.type] || EVENT_ICONS.autre;
    const desc = [a ? a.enseigne : "", e.notes || ""].filter(Boolean).join(" — ");
    raw.push("BEGIN:VEVENT", "UID:" + e.id + "@mitmit.penup3d", "DTSTAMP:" + stamp);
    if (e.heure && /^\d{1,2}:\d{2}$/.test(e.heure)) {
      const [hh, mm] = e.heure.split(":"); const p = (n) => String(n).padStart(2, "0");
      const end = new Date(e.date + "T" + p(hh) + ":" + mm + ":00"); end.setHours(end.getHours() + 1);
      raw.push("DTSTART:" + icsDay(e.date) + "T" + p(hh) + mm + "00");
      raw.push("DTEND:" + icsDay(e.date) + "T" + p(end.getHours()) + p(end.getMinutes()) + "00");
    } else {
      raw.push("DTSTART;VALUE=DATE:" + icsDay(e.date), "DTEND;VALUE=DATE:" + icsNextDay(e.date));
    }
    raw.push("SUMMARY:" + icsEscape((icon ? icon + " " : "") + (e.titre || "Événement")));
    if (desc) raw.push("DESCRIPTION:" + icsEscape(desc));
    raw.push("END:VEVENT");
  });
  (data.accounts || []).filter((a) => a.dateAction && a.prochaineAction).forEach((a) => {
    raw.push("BEGIN:VEVENT", "UID:action_" + a.id + "@mitmit.penup3d", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + icsDay(a.dateAction), "DTEND;VALUE=DATE:" + icsNextDay(a.dateAction), "SUMMARY:" + icsEscape("🔔 " + a.prochaineAction + (a.enseigne ? " — " + a.enseigne : "")), "END:VEVENT");
  });
  (data.contacts || []).filter((c) => c.naissance && /^\d{4}-\d{2}-\d{2}$/.test(c.naissance)).forEach((c) => {
    const a = accById(c.accountId);
    raw.push("BEGIN:VEVENT", "UID:anniv_" + c.id + "@mitmit.penup3d", "DTSTAMP:" + stamp, "DTSTART;VALUE=DATE:" + icsDay(c.naissance), "DTEND;VALUE=DATE:" + icsNextDay(c.naissance), "RRULE:FREQ=YEARLY", "SUMMARY:" + icsEscape("🎂 Anniversaire " + fullName(c) + (a ? " (" + a.enseigne + ")" : "")), "END:VEVENT");
  });
  raw.push("END:VCALENDAR");
  return raw.map(icsFold).join("\r\n");
}

// Comparaison de jetons à temps ~constant (évite de fuiter la longueur/position via le timing).
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req, res) {
  const token = ((req.query && req.query.token) || "").toString();
  if (!token) { res.status(400).send("Paramètre « token » manquant."); return; }
  if (!SUPA_URL || !SUPA_KEY) { res.status(500).send("Flux calendrier non configuré côté serveur (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)."); return; }
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/cockpit_state?id=eq.shared&select=data`, {
      headers: { apikey: SUPA_KEY, Authorization: "Bearer " + SUPA_KEY },
    });
    if (!r.ok) { res.status(502).send("Lecture des données impossible (" + r.status + ")."); return; }
    const rows = await r.json();
    const data = rows && rows[0] && rows[0].data;
    if (!data) { res.status(404).send("Aucune donnée trouvée."); return; }
    const expected = data.settings && data.settings.calendarToken;
    if (!expected || !safeEqual(token, expected)) { res.status(403).send("Jeton invalide. Régénérez le lien d'abonnement dans l'application."); return; }
    const ics = buildCalendarICS(data);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'inline; filename="penup3d-calendrier.ics"');
    res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");
    res.status(200).send(ics);
  } catch (e) {
    res.status(500).send("Erreur serveur : " + (e && e.message ? e.message : String(e)));
  }
}
