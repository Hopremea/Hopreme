import { createClient } from "@supabase/supabase-js";

// Configuration via variables d'environnement (Vercel ou .env.local).
// Si l'URL ou la cle anon manquent, Supabase est desactive et l'app retombe
// sur localStorage : elle continue donc de fonctionner, sans synchronisation.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anonKey);

// Integration native Clerk-Supabase : le client joint le jeton de session Clerk
// a chaque requete via l'option accessToken. window.__getClerkToken est expose
// par ClerkTokenBridge dans main.jsx. Pas de template JWT, pas de secret partage.
export const supabase = supabaseEnabled
  ? createClient(url, anonKey, {
      accessToken: async () => {
        try {
          if (typeof window !== "undefined" && window.__getClerkToken) {
            return (await window.__getClerkToken()) || null;
          }
        } catch (e) {
          /* token indisponible : requete anonyme, bloquee par la RLS */
        }
        return null;
      },
    })
  : null;
