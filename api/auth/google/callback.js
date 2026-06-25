import { exchangeCodeForToken } from "../../../lib/gmail.js";

// Callback OAuth : Google renvoie ici avec ?code=... . On échange le code contre
// un refresh token, puis on l'AFFICHE pour que tu le colles dans la variable
// d'environnement GOOGLE_REFRESH_TOKEN (Vercel) de MITMIT.
function htmlPage(res, title, body) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#fff8ea;color:#16203a;}
  .card{max-width:640px;background:#fff;border-radius:20px;padding:32px;box-shadow:0 20px 60px -16px rgba(15,23,42,.18);}
  h1{font-size:21px;margin:0 0 8px;} .muted{color:#5b6492;font-size:13px;line-height:1.55;}
  .token{font-family:ui-monospace,monospace;font-size:12px;background:#16203a;color:#c6cce3;border-radius:12px;
         padding:14px 16px;word-break:break-all;margin:12px 0;}
  button,a.btn{display:inline-flex;gap:8px;background:#3F60AA;color:#fff;border:none;border-radius:12px;
       padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;}
  code{background:rgba(63,96,170,.12);color:#3F60AA;padding:2px 6px;border-radius:4px;font-size:12px;}
  ol{line-height:1.8;font-size:14px;} .err{color:#b91c1c;} .ok{color:#047857;}
</style></head><body><div class="card">${body}</div></body></html>`
  );
}

export default async function handler(req, res) {
  const q = req.query || {};
  const code = q.code;
  const error = q.error;

  if (error) {
    htmlPage(res, "Erreur Gmail OAuth", `<h1 class="err">❌ Erreur Google : ${error}</h1>
      <p class="muted">${q.error_description || ""}</p>`);
    return;
  }
  if (!code) {
    htmlPage(res, "Code manquant", `<h1 class="err">❌ Pas de code reçu</h1>
      <p class="muted">URL de callback probablement mal configurée dans Google Cloud.</p>`);
    return;
  }

  try {
    const tokens = await exchangeCodeForToken(String(code));
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      htmlPage(res, "Pas de refresh token", `<h1 class="err">⚠️ Pas de refresh_token reçu</h1>
        <p class="muted">Cas typique : ce compte a déjà autorisé l'app. Va sur
        <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>,
        retire l'autorisation, puis réessaie.</p>
        <a href="/api/auth/google" class="btn">Réessayer</a>`);
      return;
    }

    htmlPage(res, "Gmail connecté ✅", `<h1 class="ok">✅ Gmail connecté</h1>
      <p class="muted">Voici le <strong>refresh token</strong> de ce compte. Colle-le dans
      <code>GOOGLE_REFRESH_TOKEN</code> (env de MITMIT sur Vercel), puis redéploie.</p>
      <div class="token" id="tok">${refreshToken}</div>
      <ol>
        <li>Clique <strong>Copier</strong></li>
        <li>Vercel → projet MITMIT → Settings → Environment Variables</li>
        <li>Add : <code>GOOGLE_REFRESH_TOKEN</code> → colle → Save</li>
        <li>Redeploy</li>
      </ol>
      <button onclick="navigator.clipboard.writeText(document.getElementById('tok').innerText).then(()=>this.innerText='✓ Copié')">📋 Copier le token</button>`);
  } catch (err) {
    htmlPage(res, "Erreur d'échange", `<h1 class="err">❌ Erreur d'échange du code</h1>
      <p class="muted">${String(err)}</p>`);
  }
}
