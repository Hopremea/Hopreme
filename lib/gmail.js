/* ============================================================================
 * Gmail OAuth + envoi (avec signature auto-injectée) — version MITMIT.
 * Adaptée du SaaS Influence : ici en fetch pur (pas de dépendance googleapis),
 * pour rester cohérent avec les fonctions serverless Vercel de MITMIT.
 * ----------------------------------------------------------------------------
 * Connecte UNE boîte Gmail en OAuth2 (refresh token) et envoie des mails via
 * l'API Gmail REST. AUCUNE adresse n'est en dur : l'expéditeur vit dans la
 * variable d'env GOOGLE_USER_EMAIL.
 *
 * Env requis :
 *   GOOGLE_CLIENT_ID       (app OAuth Google Cloud — réutilise celle d'Influence)
 *   GOOGLE_CLIENT_SECRET   (idem)
 *   GOOGLE_REFRESH_TOKEN   (PROPRE à ce compte — obtenu via /api/auth/google)
 *   GOOGLE_USER_EMAIL      (ex: matthis-anael@penup3d.com)
 * Env optionnels :
 *   GMAIL_FROM_NAME        (nom affiché dans le From, ex: "Matthis - MITMIT")
 *   NEXT_PUBLIC_APP_URL    (URL publique de MITMIT, pour construire le redirect)
 * ========================================================================== */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
/* Cette URL doit être enregistrée à l'identique dans les
   « Authorized redirect URIs » de l'app OAuth Google Cloud. */
export function getRedirectUri() {
  return `${appUrl()}/api/auth/google/callback`;
}
export function gmailHasOAuth() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}
export function gmailIsConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

export function getAuthUrl() {
  if (!gmailHasOAuth()) throw new Error("Google OAuth non configuré (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)");
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // indispensable pour recevoir un refresh token
    prompt: "consent", // force Google à ré-émettre le refresh token
    include_granted_scopes: "true",
  });
  return "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString();
}

async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("OAuth Google : " + (data.error_description || data.error || res.status));
  return data;
}

export async function exchangeCodeForToken(code) {
  return tokenRequest({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
}

/* Échange le refresh token contre un access token frais (validité ~1h). */
async function getAccessToken() {
  if (!gmailIsConfigured()) throw new Error("Gmail non connecté (GOOGLE_REFRESH_TOKEN manquant)");
  const data = await tokenRequest({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  return data.access_token;
}

/* ============================ Signature Gmail =============================
   Récupère la signature HTML configurée dans Gmail (Réglages → Signatures)
   pour le sendAs correspondant à GOOGLE_USER_EMAIL. Cache 5 min. */
let _cachedSignature = null;
const SIGNATURE_TTL_MS = 5 * 60 * 1000;

export async function getGmailSignature(accessToken, force = false) {
  if (!force && _cachedSignature && Date.now() - _cachedSignature.ts < SIGNATURE_TTL_MS) {
    return _cachedSignature.html;
  }
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!res.ok) throw new Error("sendAs " + res.status);
    const data = await res.json();
    const own = (process.env.GOOGLE_USER_EMAIL || "").toLowerCase();
    const list = data.sendAs || [];
    const match =
      list.find((s) => (s.sendAsEmail || "").toLowerCase() === own) ||
      list.find((s) => s.isPrimary) ||
      list[0];
    const sig = (match && match.signature) || "";
    _cachedSignature = { html: sig, ts: Date.now() };
    return sig;
  } catch (e) {
    _cachedSignature = { html: "", ts: Date.now() };
    return "";
  }
}

/* ------------------------------ Helpers MIME ------------------------------ */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function plainBodyToHtml(plain) {
  return escapeHtml(plain).replace(/\r?\n/g, "<br>\n");
}
function htmlSignatureToPlain(html) {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "$1")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<\/(p|div|br|li|tr|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------ Envoi ------------------------------------- */
export async function sendEmail({
  to,
  subject,
  body,
  threadId,
  bccSelf = true,
  appendSignature = true,
  attachments = [],
}) {
  const accessToken = await getAccessToken();
  const fromEmail = process.env.GOOGLE_USER_EMAIL || "";
  const fromDisplay = process.env.GMAIL_FROM_NAME || fromEmail;
  const utf8Subject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const fromHeader = /[^\x20-\x7e]/.test(fromDisplay)
    ? `=?UTF-8?B?${Buffer.from(fromDisplay, "utf8").toString("base64")}?= <${fromEmail}>`
    : `${fromDisplay} <${fromEmail}>`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2, 10)}@${
    (fromEmail.split("@")[1] || "penup3d.com")
  }>`;

  const signatureHtml = appendSignature ? await getGmailSignature(accessToken) : "";
  const hasSig = signatureHtml.trim().length > 0;

  const baseHeaders = [
    fromEmail ? `From: ${fromHeader}` : null,
    `To: ${to}`,
    bccSelf && fromEmail ? `Bcc: ${fromEmail}` : null,
    fromEmail ? `Reply-To: ${fromHeader}` : null,
    `Subject: ${utf8Subject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  function buildBodyEntity() {
    const textPart = hasSig ? `${body}\n\n${htmlSignatureToPlain(signatureHtml)}`.trim() : body;
    const htmlPart = hasSig
      ? `<div>${plainBodyToHtml(body)}</div><br>\n<div class="gmail_signature">${signatureHtml}</div>`
      : `<div>${plainBodyToHtml(body)}</div>`;
    const altBoundary = `alt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    return [
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      `--${altBoundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      textPart,
      "",
      `--${altBoundary}`,
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlPart,
      "",
      `--${altBoundary}--`,
    ].join("\r\n");
  }

  const bodyEntity = buildBodyEntity();
  const validAttachments = (attachments || []).filter((a) => a && a.content && a.content.length > 0);

  let raw;
  if (validAttachments.length === 0) {
    raw = `${baseHeaders.join("\r\n")}\r\n${bodyEntity}`;
  } else {
    const mixedBoundary = `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const attachmentParts = validAttachments.map((a) => {
      const buf = Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content);
      const b64 = buf.toString("base64").replace(/(.{76})/g, "$1\r\n");
      const safeName = (a.filename || "fichier").replace(/[\r\n"]/g, "");
      return [
        `--${mixedBoundary}`,
        `Content-Type: ${a.mimeType || "application/octet-stream"}; name="${safeName}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename="${safeName}"`,
        "",
        b64,
      ].join("\r\n");
    });
    raw = [
      `${baseHeaders.join("\r\n")}\r\nContent-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      bodyEntity,
      ...attachmentParts,
      `--${mixedBoundary}--`,
      "",
    ].join("\r\n");
  }

  const encoded = Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Envoi Gmail : " + ((data.error && data.error.message) || res.status));
  return data;
}

/* Renvoie l'adresse réellement connectée (vérifie que le compte == GOOGLE_USER_EMAIL). */
export async function getConnectedEmail() {
  try {
    const accessToken = await getAccessToken();
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email || null;
  } catch {
    return null;
  }
}
